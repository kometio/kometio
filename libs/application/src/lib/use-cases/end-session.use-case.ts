import {
  CannotEndCurrentSessionError,
  SessionNotFoundError,
} from '@kometio/domain-core';
import type { AccountSessionsDeps } from './list-sessions.use-case';

export interface EndSessionInput {
  tenantId: string;
  userId: string;
  sessionId: string;
  currentSessionToken: string;
}

/**
 * Signs the person out of one of their other devices — a laptop left in an
 * office, a phone that is gone. The device the request comes from is not ended
 * here: that is `logoutUser`, and a person who ended their own session from a
 * list would be left with a cookie for it.
 *
 * Somebody else's session id is "not found", the same as one that never
 * existed: the answer must not say that another person has a session by that id.
 */
export async function endSession(
  deps: AccountSessionsDeps,
  input: EndSessionInput,
): Promise<void> {
  const sessions = await deps.authPort.listSessionsForUser(
    input.userId,
    input.tenantId,
    input.currentSessionToken,
  );
  const target = sessions.find((session) => session.id === input.sessionId);
  if (!target) {
    throw new SessionNotFoundError(input.sessionId);
  }
  if (target.isCurrent) {
    throw new CannotEndCurrentSessionError();
  }

  const ended = await deps.authPort.invalidateSessionOfUser(
    input.userId,
    input.tenantId,
    input.sessionId,
  );
  if (!ended) {
    // It ended between the list and here (used up, or ended from elsewhere).
    throw new SessionNotFoundError(input.sessionId);
  }
}
