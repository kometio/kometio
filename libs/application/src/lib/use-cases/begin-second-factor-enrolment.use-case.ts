import {
  IncorrectPasswordError,
  SecondFactorAlreadyEnabledError,
  SecondFactorNotAvailableError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  SecretCipherPort,
  TotpPort,
  UserRepositoryPort,
} from '@kometio/ports';

export interface BeginSecondFactorEnrolmentDeps {
  userRepository: Pick<UserRepositoryPort, 'findById'>;
  authPort: Pick<AuthPort, 'verifyPassword'>;
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    'findTotp' | 'savePendingTotp'
  >;
  totpPort: Pick<TotpPort, 'generateSecret' | 'provisioningUri'>;
  /** `null` where the deployment has nowhere to keep a sealed secret. */
  secretCipher: Pick<SecretCipherPort, 'seal'> | null;
}

export interface BeginSecondFactorEnrolmentInput {
  tenantId: string;
  userId: string;
  /** Asked again: a session left open must not be enough to put a second factor of its own on an account. */
  password: string;
  /** What the app shows beside the code: the site's name. */
  issuer: string;
}

export interface SecondFactorEnrolment {
  /** The secret as text, for the person who cannot scan. Shown now and never again. */
  secret: string;
  /** What the QR code says. */
  provisioningUri: string;
}

/**
 * The first half of turning the second step on: a secret is made, sealed and
 * kept as pending, and shown to the person once.
 *
 * It is not on yet. It is switched on by the first code that fits it
 * (`confirmSecondFactorEnrolment`), because a secret that was never scanned
 * would otherwise lock the person out at the next sign-in. Starting again
 * replaces a pending secret, which is what leaving the dialog half way costs.
 */
export async function beginSecondFactorEnrolment(
  deps: BeginSecondFactorEnrolmentDeps,
  input: BeginSecondFactorEnrolmentInput,
): Promise<SecondFactorEnrolment> {
  if (!deps.secretCipher) throw new SecondFactorNotAvailableError();

  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) throw new UserNotFoundError(input.userId);

  const matches = await deps.authPort.verifyPassword(
    input.password,
    user.passwordHash,
  );
  if (!matches) throw new IncorrectPasswordError();

  const existing = await deps.secondFactorRepository.findTotp(
    input.tenantId,
    input.userId,
  );
  if (existing?.confirmedAt) throw new SecondFactorAlreadyEnabledError();

  const secret = deps.totpPort.generateSecret();
  await deps.secondFactorRepository.savePendingTotp(
    input.tenantId,
    input.userId,
    deps.secretCipher.seal(secret),
  );

  return {
    secret,
    provisioningUri: deps.totpPort.provisioningUri({
      secret,
      accountName: user.email,
      issuer: input.issuer,
    }),
  };
}
