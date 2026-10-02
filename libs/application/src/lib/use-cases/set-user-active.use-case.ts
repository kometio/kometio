import { assertNotYourself } from './assert-not-yourself';
import { UserNotFoundError } from '@kometio/domain-core';
import type { User } from '@kometio/domain-core';
import type { AuthPort, UserRepositoryPort } from '@kometio/ports';

export interface SetUserActiveDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
}

export interface SetUserActiveInput {
  tenantId: string;
  userId: string;
  isActive: boolean;
  /** Who is asking — nobody may switch off their own account, see CannotChangeYourOwnAccessError. */
  actorUserId: string | null;
}

/**
 * A separate use-case from updateUserRole on purpose, same reasoning as
 * setPageParent/updateSiteLayoutSectionSticky: this is a structural
 * on/off switch, not a content edit.
 *
 * Refuses to switch off the last administrator who can still sign in:
 * that locks everyone out, and there is no way back through the product
 * — an editor cannot promote anybody, so it takes an UPDATE on the
 * database. UserRepositoryPort.saveAccess refuses it, in the same step as
 * the write.
 *
 * Deactivating also invalidates any already-open sessions (same
 * reasoning as resetPassword) — RolesGuard checking `isActive` on every
 * request would eventually catch a deactivated user anyway, but ending
 * sessions immediately means there's no window where their existing
 * cookie still works until their next guarded call happens to run.
 */
export async function setUserActive(
  deps: SetUserActiveDeps,
  input: SetUserActiveInput,
): Promise<User> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }

  if (input.isActive) {
    user.reactivate();
  } else {
    assertNotYourself(input.actorUserId, user);
    user.deactivate();
  }
  await deps.userRepository.saveAccess(user);

  if (!input.isActive) {
    await deps.authPort.invalidateAllSessionsForUser(user.id, user.tenantId);
  }

  return user;
}
