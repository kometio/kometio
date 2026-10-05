import { randomUUID } from 'node:crypto';
import { User, UserEmailAlreadyExistsError } from '@kometio/domain-core';
import type { UserRole } from '@kometio/domain-core';
import type { InterfaceLanguage } from '@kometio/shared-types';
import type {
  AuthPort,
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildInviteEmail } from '../emails/invite-email.template';
import { trySendEmail, type UndeliveredEmail } from '../emails/try-send-email';
import { chooseAuthorSlug } from './author-profile';

// Longer than password-reset's 1h: accepting an invite isn't a
// time-sensitive security action, and an admin realistically expects a
// new collaborator to get to it within a normal work week, not an hour.
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface InviteUserDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface InviteUserInput {
  tenantId: string;
  email: string;
  displayName: string;
  role: UserRole;
  /**
   * The language the inviter chose for the invitee: their invitation is
   * written in it, and so is everything sent to them after — until they
   * choose another. None leaves it to the site's language.
   */
  language?: InterfaceLanguage;
  /** e.g. EDITOR_APP_URL — the use-case appends `/accept-invite?inviteToken=<token>`. */
  inviteUrlBase: string;
}

export interface InviteUserResult {
  user: User;
  /**
   * The invitation if the mail server did not take it. The person is invited
   * all the same, with a link that works: it is the administrator's to be told
   * (and to resend once the mail server works), not an error that leaves them
   * to try again and be told the address is taken.
   */
  undelivered: UndeliveredEmail[];
}

/**
 * Creates the User row immediately, inactive (`isActive: false`) with an
 * unguessable random password hash — nobody can sign in until
 * `acceptInvite` sets a real password and reactivates the account. This
 * is what lets the invite token reuse the exact same
 * `VerificationTokenPort` mechanic as password-reset/email-verification
 * (`userId` must reference an existing row), instead of inventing a
 * separate "pending invite, no user yet" concept.
 */
export async function inviteUser(
  deps: InviteUserDeps,
  input: InviteUserInput,
): Promise<InviteUserResult> {
  const existing = await deps.userRepository.findByEmail(
    input.tenantId,
    input.email,
  );
  if (existing) {
    throw new UserEmailAlreadyExistsError(input.email);
  }

  const unguessablePassword = randomUUID() + randomUUID();
  const passwordHash = await deps.authPort.hashPassword(unguessablePassword);

  const id = randomUUID();
  const user = User.create({
    id,
    tenantId: input.tenantId,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    role: input.role,
    isActive: false,
    invitePending: true,
    language: input.language,
    // Their author address, made now from the name they were invited
    // with — a person with a name should never have to set one to get a
    // byline that links somewhere (docs/adr/0071).
    slug: await chooseAuthorSlug(deps, input.tenantId, input.displayName, id),
  });
  await deps.userRepository.add(user);

  const inviteToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'user-invite',
    INVITE_TTL_MS,
  );
  const inviteUrlBase = input.inviteUrlBase.replace(/\/$/, '');
  const inviteUrl = `${inviteUrlBase}/accept-invite?inviteToken=${inviteToken.token}`;

  const undelivered = await trySendEmail(deps.emailPort, {
    to: user.email,
    ...buildInviteEmail(await emailLanguageOfUser(deps, user), inviteUrl),
  });

  return { user, undelivered };
}
