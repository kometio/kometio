import type { AccountSessionsDeps } from './list-sessions.use-case';

export interface EndOtherSessionsInput {
  tenantId: string;
  userId: string;
  currentSessionToken: string;
}

/** Signs the person out everywhere but where they are: what to do on suspecting a password is known. */
export async function endOtherSessions(
  deps: AccountSessionsDeps,
  input: EndOtherSessionsInput,
): Promise<void> {
  await deps.authPort.invalidateOtherSessionsForUser(
    input.userId,
    input.tenantId,
    input.currentSessionToken,
  );
}
