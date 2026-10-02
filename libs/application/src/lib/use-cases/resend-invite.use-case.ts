import {
  UserAlreadyActiveError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  EmailPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import {
  emailLanguageOfUser,
  type EmailLanguageDeps,
} from '../emails/email-language';
import { buildInviteEmail } from '../emails/invite-email.template';

// Same TTL as the original invite (inviteUser) — a re-invite is just a
// fresh shot at the same 7-day window, not a different policy.
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface ResendInviteDeps extends EmailLanguageDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
}

export interface ResendInviteInput {
  tenantId: string;
  userId: string;
  /** e.g. EDITOR_APP_URL — same base inviteUser uses. */
  inviteUrlBase: string;
}

/**
 * Security review 2026-08-24, "terzo giro": inviteUser creates the User
 * row immediately with isActive:false; the 7-day invite token then simply
 * expires with no cleanup job and no way to give the invitee a fresh
 * link — the email stays permanently blocked by
 * UserEmailAlreadyExistsError, an admin's only recourse was direct DB
 * access. This mints a brand new token (the old one, if still
 * unconsumed, keeps working too — having two valid invite links for the
 * same pending user is harmless, not a security concern) and re-sends
 * the same invite email inviteUser sends.
 */
export async function resendInvite(
  deps: ResendInviteDeps,
  input: ResendInviteInput,
): Promise<void> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }
  if (user.isActive) {
    throw new UserAlreadyActiveError(input.userId);
  }

  const inviteToken = await deps.verificationTokenPort.createToken(
    user.id,
    user.tenantId,
    'user-invite',
    INVITE_TTL_MS,
  );
  const inviteUrlBase = input.inviteUrlBase.replace(/\/$/, '');
  const inviteUrl = `${inviteUrlBase}/accept-invite?inviteToken=${inviteToken.token}`;

  await deps.emailPort.sendEmail({
    to: user.email,
    ...buildInviteEmail(await emailLanguageOfUser(deps, user), inviteUrl),
  });
}
