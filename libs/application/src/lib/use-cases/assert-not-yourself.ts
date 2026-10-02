import { CannotChangeYourOwnAccessError } from '@kometio/domain-core';
import type { User } from '@kometio/domain-core';

/**
 * Refuses a change somebody is making to their own access.
 *
 * Deactivating yourself, or demoting yourself, takes effect instantly
 * and ends your own sessions: the next thing the screen says is that
 * your session expired, and the way back in is somebody else — or, if
 * you were the only administrator, an UPDATE on the database. Nobody
 * means to do it. It is refused whatever the tenant's state, before the
 * last-administrator question is even asked, because the answer does not
 * depend on it.
 */
export function assertNotYourself(
  actorUserId: string | null,
  target: User,
): void {
  if (actorUserId && actorUserId === target.id) {
    throw new CannotChangeYourOwnAccessError();
  }
}
