import {
  IncorrectPasswordError,
  SecondFactorNotEnabledError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';

export interface DisableSecondFactorDeps {
  userRepository: Pick<UserRepositoryPort, 'findById'>;
  authPort: Pick<AuthPort, 'verifyPassword' | 'invalidateOtherSessionsForUser'>;
  secondFactorRepository: Pick<SecondFactorRepositoryPort, 'removeAll'>;
}

export interface DisableSecondFactorInput {
  tenantId: string;
  userId: string;
  password: string;
  currentSessionToken: string;
}

/**
 * A person turning their own second step off, by giving the password.
 *
 * The password and not a code: the session already passed the second step to
 * be here, and a person who has lost the app is exactly who needs this (they
 * got in with a recovery code). Other sessions end, as when it was turned on.
 */
export async function disableSecondFactor(
  deps: DisableSecondFactorDeps,
  input: DisableSecondFactorInput,
): Promise<void> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) throw new UserNotFoundError(input.userId);

  const matches = await deps.authPort.verifyPassword(
    input.password,
    user.passwordHash,
  );
  if (!matches) throw new IncorrectPasswordError();

  const removed = await deps.secondFactorRepository.removeAll(
    input.tenantId,
    input.userId,
  );
  if (!removed) throw new SecondFactorNotEnabledError();

  await deps.authPort.invalidateOtherSessionsForUser(
    input.userId,
    input.tenantId,
    input.currentSessionToken,
  );
}
