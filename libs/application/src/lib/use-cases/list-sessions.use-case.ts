import type { ActiveSession, AuthPort } from '@kometio/ports';

export interface AccountSessionsDeps {
  authPort: AuthPort;
}

export interface ListSessionsInput {
  tenantId: string;
  userId: string;
  /** The session the request came with: it is the one the list marks as this device. */
  currentSessionToken: string;
}

/**
 * Where the person is signed in (docs/adr/0129): the devices they would
 * recognise, the most recently used first. Only their own: there is no user id
 * to ask for another person's.
 */
export function listSessions(
  deps: AccountSessionsDeps,
  input: ListSessionsInput,
): Promise<ActiveSession[]> {
  return deps.authPort.listSessionsForUser(
    input.userId,
    input.tenantId,
    input.currentSessionToken,
  );
}
