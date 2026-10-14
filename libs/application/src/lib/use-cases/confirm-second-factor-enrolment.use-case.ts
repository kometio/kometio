import {
  NoSecondFactorEnrolmentError,
  SecondFactorCodeMismatchError,
  SecondFactorNotAvailableError,
  SecretUnreadableError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  SecretCipherPort,
  TotpPort,
} from '@kometio/ports';
import { RECOVERY_CODE_COUNT } from './second-factor-policy';

export interface ConfirmSecondFactorEnrolmentDeps {
  authPort: Pick<AuthPort, 'invalidateOtherSessionsForUser'>;
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    'findTotp' | 'confirmTotp'
  >;
  totpPort: Pick<
    TotpPort,
    'verify' | 'generateRecoveryCode' | 'hashRecoveryCode'
  >;
  secretCipher: Pick<SecretCipherPort, 'open'> | null;
}

export interface ConfirmSecondFactorEnrolmentInput {
  tenantId: string;
  userId: string;
  /** What the app shows now. */
  code: string;
  /** The session this is done from: it stays, every other one ends. */
  currentSessionToken: string;
  now?: Date;
}

export interface ConfirmSecondFactorEnrolmentResult {
  /** In the clear, once: only their hashes are kept. */
  recoveryCodes: string[];
}

/**
 * The second half: the first code that fits the pending secret switches the
 * second step on and makes the recovery codes.
 *
 * The code proves the person's app holds the secret, which is the one thing
 * that makes it safe to start asking for it. The first step is recorded as
 * used, so that this same code cannot be given again at the next sign-in
 * within its thirty seconds. Every other session ends: a second step that
 * left a stolen session signed in would not be a second step.
 */
export async function confirmSecondFactorEnrolment(
  deps: ConfirmSecondFactorEnrolmentDeps,
  input: ConfirmSecondFactorEnrolmentInput,
): Promise<ConfirmSecondFactorEnrolmentResult> {
  if (!deps.secretCipher) throw new SecondFactorNotAvailableError();

  const factor = await deps.secondFactorRepository.findTotp(
    input.tenantId,
    input.userId,
  );
  if (!factor || factor.confirmedAt) throw new NoSecondFactorEnrolmentError();

  let secret: string;
  try {
    secret = deps.secretCipher.open(factor.sealedSecret);
  } catch (error) {
    // The key that sealed it is gone: what is pending cannot be finished,
    // and starting again makes a new one.
    if (error instanceof SecretUnreadableError) {
      throw new NoSecondFactorEnrolmentError();
    }
    throw error;
  }

  const accepted = deps.totpPort.verify({
    secret,
    code: input.code,
    at: input.now ?? new Date(),
  });
  if (!accepted) throw new SecondFactorCodeMismatchError();

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    deps.totpPort.generateRecoveryCode(),
  );
  const confirmed = await deps.secondFactorRepository.confirmTotp(
    input.tenantId,
    input.userId,
    accepted.step,
    recoveryCodes.map((code) => deps.totpPort.hashRecoveryCode(code)),
  );
  // Another request finished it, or began again, in between.
  if (!confirmed) throw new NoSecondFactorEnrolmentError();

  await deps.authPort.invalidateOtherSessionsForUser(
    input.userId,
    input.tenantId,
    input.currentSessionToken,
  );
  return { recoveryCodes };
}
