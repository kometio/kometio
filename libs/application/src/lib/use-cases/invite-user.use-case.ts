import { randomUUID } from 'node:crypto';
import { User, UserEmailAlreadyExistsError } from '@kometio/domain-core';
import type { UserRole } from '@kometio/domain-core';
import type { InterfaceLanguage } from '@kometio/shared-types';
import type { AuthPort, UserRepositoryPort } from '@kometio/ports';
import { chooseAuthorSlug } from './author-profile';
import {
  issueInvite,
  type IssueInviteDeps,
  type IssuedInvite,
} from './issue-invite';

export interface InviteUserDeps extends IssueInviteDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
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

/**
 * `undelivered` is the invitation if the mail server did not take it. The
 * person is invited all the same, with a link that works: it is the
 * administrator's to be told (and to resend once the mail server works), not
 * an error that leaves them to try again and be told the address is taken.
 * `inviteLink` is the link when there is no mail server to carry it.
 */
export interface InviteUserResult extends IssuedInvite {
  user: User;
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

  return {
    user,
    ...(await issueInvite(deps, { user, inviteUrlBase: input.inviteUrlBase })),
  };
}
