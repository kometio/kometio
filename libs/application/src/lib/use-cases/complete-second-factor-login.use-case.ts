import {
  InvalidSecondFactorError,
  SecretUnreadableError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  SecretCipherPort,
  Session,
  TotpPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import { describeDevice } from '../sessions/describe-device';
import {
  SECOND_FACTOR_CHALLENGE_TTL_MS,
  SECOND_FACTOR_LOCK_MS,
  SECOND_FACTOR_MAX_ATTEMPTS,
  SECOND_FACTOR_MAX_FAILED_ATTEMPTS,
} from './second-factor-policy';

export interface CompleteSecondFactorLoginDeps {
  userRepository: Pick<UserRepositoryPort, 'findById'>;
  authPort: Pick<AuthPort, 'createSession'>;
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    | 'findTotp'
    | 'useStep'
    | 'recordFailedAttempt'
    | 'clearFailedAttempts'
    | 'spendRecoveryCode'
    | 'countUnspentRecoveryCodes'
  >;
  totpPort: Pick<
    TotpPort,
    'verify' | 'hashRecoveryCode' | 'looksLikeRecoveryCode'
  >;
  verificationTokenPort: VerificationTokenPort;
  /** `null` where nothing is sealed: only a recovery code can then be given. */
  secretCipher: Pick<SecretCipherPort, 'open'> | null;
}

export interface CompleteSecondFactorLoginInput {
  /** What `loginUser` gave back after the password. */
  challenge: string;
  /** A code from the app, or a recovery code. */
  code: string;
  userAgent?: string;
  now?: Date;
}

export interface CompleteSecondFactorLoginResult {
  session: Session;
  /** Whether a recovery code was spent: said in the log, and to the person. */
  usedRecoveryCode: boolean;
  /** How many are left, when one was just used. */
  recoveryCodesLeft: number | null;
}

/**
 * The second step of a sign-in: the code, against the challenge the right
 * password led to (docs/adr/0137).
 *
 * A challenge is spent when it is read, so nothing is replayed. A wrong code
 * hands back a fresh one carrying the number of tries, up to
 * `SECOND_FACTOR_MAX_ATTEMPTS`; after that the person starts again from the
 * password, which has its own throttle and captcha. A code from the app is
 * good once (`useStep` moves the accepted step forward in the same statement
 * that checks it) and a recovery code is spent by being used.
 *
 * Every refusal is the same `InvalidSecondFactorError`: whether the code was
 * wrong, the challenge had run out or the account was switched off since is
 * not for whoever is asking to know.
 */
export async function completeSecondFactorLogin(
  deps: CompleteSecondFactorLoginDeps,
  input: CompleteSecondFactorLoginInput,
): Promise<CompleteSecondFactorLoginResult> {
  const challenge = await deps.verificationTokenPort.consumeToken(
    input.challenge,
    'second-factor',
  );
  if (!challenge) throw new InvalidSecondFactorError(null, null);

  const { userId, tenantId } = challenge;
  const user = await deps.userRepository.findById(tenantId, userId);
  const factor = await deps.secondFactorRepository.findTotp(tenantId, userId);
  // Switched off, or taken off by an administrator, since the password: the
  // person starts again, and is not asked for something that is gone.
  if (!user?.isActive || !factor?.confirmedAt) {
    throw new InvalidSecondFactorError(userId, null);
  }

  const now = input.now ?? new Date();
  const refuse = async (locked = false): Promise<never> => {
    const attempts = (Number(challenge.payload) || 0) + 1;
    if (attempts >= SECOND_FACTOR_MAX_ATTEMPTS) {
      throw new InvalidSecondFactorError(userId, null, locked);
    }
    const next = await deps.verificationTokenPort.createToken(
      userId,
      tenantId,
      'second-factor',
      SECOND_FACTOR_CHALLENGE_TTL_MS,
      String(attempts),
    );
    throw new InvalidSecondFactorError(userId, next.token, locked);
  };
  /** A wrong code of the app: counted against the person, and refused. */
  const refuseWrongCode = async (): Promise<never> => {
    await deps.secondFactorRepository.recordFailedAttempt(
      tenantId,
      userId,
      now,
      {
        maxAttempts: SECOND_FACTOR_MAX_FAILED_ATTEMPTS,
        lockMs: SECOND_FACTOR_LOCK_MS,
      },
    );
    return refuse();
  };

  let usedRecoveryCode = false;
  if (deps.totpPort.looksLikeRecoveryCode(input.code)) {
    const spent = await deps.secondFactorRepository.spendRecoveryCode(
      tenantId,
      userId,
      deps.totpPort.hashRecoveryCode(input.code),
    );
    if (!spent) return refuse();
    usedRecoveryCode = true;
    // A recovery code is who the lock is not for: it opens the codes of the
    // app again for the person it was held back from.
    await deps.secondFactorRepository.clearFailedAttempts(tenantId, userId);
  } else {
    // Held back: the code is not even looked at, so a guesser learns nothing
    // from the lock about whether a code was right.
    if (factor.lockedUntil && factor.lockedUntil > now) return refuse(true);
    const secret = openSecret(deps.secretCipher, factor.sealedSecret);
    const accepted =
      secret === null
        ? null
        : deps.totpPort.verify({
            secret,
            code: input.code,
            at: now,
            notBeforeStep: (factor.lastUsedStep ?? -1) + 1,
          });
    if (!accepted) return refuseWrongCode();
    // The step is taken in the row, not in this process: a second request
    // with the same code, in the same moment, is the one that loses.
    const taken = await deps.secondFactorRepository.useStep(
      tenantId,
      userId,
      accepted.step,
    );
    if (!taken) return refuseWrongCode();
  }

  const session = await deps.authPort.createSession(userId, tenantId, {
    label: describeDevice(input.userAgent),
  });
  return {
    session,
    usedRecoveryCode,
    recoveryCodesLeft: usedRecoveryCode
      ? await deps.secondFactorRepository.countUnspentRecoveryCodes(
          tenantId,
          userId,
        )
      : null,
  };
}

/** The secret, or `null` when it cannot be opened (no cipher, or its key is gone): the code then fits nothing, and a recovery code is the way in. */
function openSecret(
  cipher: Pick<SecretCipherPort, 'open'> | null,
  sealed: string,
): string | null {
  if (!cipher) return null;
  try {
    return cipher.open(sealed);
  } catch (error) {
    if (error instanceof SecretUnreadableError) return null;
    throw error;
  }
}
