import { InvalidOrExpiredTokenError } from '@kometio/domain-core';
import type { UserRepositoryPort, VerificationTokenPort } from '@kometio/ports';

export interface VerifyEmailDeps {
  userRepository: UserRepositoryPort;
  verificationTokenPort: VerificationTokenPort;
}

export interface VerifyEmailInput {
  token: string;
}

export async function verifyEmail(
  deps: VerifyEmailDeps,
  input: VerifyEmailInput,
): Promise<void> {
  const consumed = await deps.verificationTokenPort.consumeToken(
    input.token,
    'email-verification',
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

  user.verifyEmail();
  // Only how they sign in, for the reason resetPassword gives.
  await deps.userRepository.saveCredentials(user);
}
