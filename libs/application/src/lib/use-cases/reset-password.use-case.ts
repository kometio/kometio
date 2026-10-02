import { InvalidOrExpiredTokenError } from '@kometio/domain-core';
import type {
  AuthPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

export interface ResetPasswordDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
  authPort: AuthPort;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export async function resetPassword(
  deps: ResetPasswordDeps,
  input: ResetPasswordInput,
): Promise<void> {
  const consumed = await deps.verificationTokenPort.consumeToken(
    input.token,
    'password-reset',
  );
  if (!consumed) {
    throw new InvalidOrExpiredTokenError();
  }

  const user = await deps.userRepository.findById(
    consumed.tenantId,
    consumed.userId,
  );
  if (!user) {
    throw new InvalidOrExpiredTokenError();
  }

  const newPasswordHash = await deps.authPort.hashPassword(input.newPassword);
  user.changePasswordHash(newPasswordHash);
  // Only how they sign in: a reset lands a moment after the token was read,
  // and `save` would put back a role or an active flag an admin changed since.
  await deps.userRepository.saveCredentials(user);

  // A reset must end any already-open sessions — e.g. the account may have
  // been compromised, which is often why a reset was triggered.
  await deps.authPort.invalidateAllSessionsForUser(user.id, user.tenantId);
}
