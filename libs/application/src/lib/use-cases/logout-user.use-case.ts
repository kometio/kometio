import type { AuthPort } from '@kometio/ports';

export interface LogoutUserDeps {
  authPort: AuthPort;
}

export interface LogoutUserInput {
  token: string;
}

export async function logoutUser(
  deps: LogoutUserDeps,
  input: LogoutUserInput,
): Promise<void> {
  await deps.authPort.invalidateSession(input.token);
}
