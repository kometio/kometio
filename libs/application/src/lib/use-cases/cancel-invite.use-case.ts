import { InviteNotPendingError, UserNotFoundError } from '@kometio/domain-core';
import type { UserRepositoryPort } from '@kometio/ports';

export interface CancelInviteDeps {
  userRepository: UserRepositoryPort;
}

export interface CancelInviteInput {
  tenantId: string;
  userId: string;
}

/**
 * Withdraws an invitation that has not been accepted: the person is
 * removed, which also takes their invite links (`verification_tokens`
 * cascade with the user) and frees the author address made for them, and
 * the email can be invited again.
 *
 * Only an invitee. Somebody who accepted — or an admin switched off — is a
 * user with a history, and taking them out is not what "cancel" means;
 * `InviteNotPendingError` says so, whether the invitation was never one or
 * was accepted while the admin was deciding.
 */
export async function cancelInvite(
  deps: CancelInviteDeps,
  input: CancelInviteInput,
): Promise<void> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }
  if (!user.invitePending) {
    throw new InviteNotPendingError(input.userId);
  }
  // Checked again by the delete itself: between the read and here the
  // invitation may have been accepted.
  const removed = await deps.userRepository.removePendingInvite(
    input.tenantId,
    input.userId,
  );
  if (!removed) {
    throw new InviteNotPendingError(input.userId);
  }
}
