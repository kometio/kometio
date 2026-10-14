import {
  UserAlreadyActiveError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type { User } from '@kometio/domain-core';
import type { UserRepositoryPort } from '@kometio/ports';
import {
  issueInvite,
  type IssueInviteDeps,
  type IssuedInvite,
} from './issue-invite';

export interface ResendInviteDeps extends IssueInviteDeps {
  userRepository: UserRepositoryPort;
}

export interface ResendInviteInput {
  tenantId: string;
  userId: string;
  /** e.g. EDITOR_APP_URL — same base inviteUser uses. */
  inviteUrlBase: string;
}

/** The same answer as the invitation itself: a re-invite is a fresh shot at the same window, not a different policy. */
export interface ResendInviteResult extends IssuedInvite {
  user: User;
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
): Promise<ResendInviteResult> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }
  if (user.isActive) {
    throw new UserAlreadyActiveError(input.userId);
  }

  return {
    user,
    ...(await issueInvite(deps, { user, inviteUrlBase: input.inviteUrlBase })),
  };
}
