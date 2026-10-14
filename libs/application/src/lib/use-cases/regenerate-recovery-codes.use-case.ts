import {
  IncorrectPasswordError,
  SecondFactorNotEnabledError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  TotpPort,
  UserRepositoryPort,
} from '@kometio/ports';
import { RECOVERY_CODE_COUNT } from './second-factor-policy';

export interface RegenerateRecoveryCodesDeps {
  userRepository: Pick<UserRepositoryPort, 'findById'>;
  authPort: Pick<AuthPort, 'verifyPassword'>;
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    'findTotp' | 'replaceRecoveryCodes'
  >;
  totpPort: Pick<TotpPort, 'generateRecoveryCode' | 'hashRecoveryCode'>;
}

export interface RegenerateRecoveryCodesInput {
  tenantId: string;
  userId: string;
  password: string;
}

/**
 * New recovery codes, for a person who has used some or lost the paper.
 * The old ones stop working at once. Asked with the password, as turning it
 * on and off is: a set of codes is a second way in.
 */
export async function regenerateRecoveryCodes(
  deps: RegenerateRecoveryCodesDeps,
  input: RegenerateRecoveryCodesInput,
): Promise<{ recoveryCodes: string[] }> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) throw new UserNotFoundError(input.userId);

  const matches = await deps.authPort.verifyPassword(
    input.password,
    user.passwordHash,
  );
  if (!matches) throw new IncorrectPasswordError();

  const factor = await deps.secondFactorRepository.findTotp(
    input.tenantId,
    input.userId,
  );
  if (!factor?.confirmedAt) throw new SecondFactorNotEnabledError();

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    deps.totpPort.generateRecoveryCode(),
  );
  await deps.secondFactorRepository.replaceRecoveryCodes(
    input.tenantId,
    input.userId,
    recoveryCodes.map((code) => deps.totpPort.hashRecoveryCode(code)),
  );
  return { recoveryCodes };
}
