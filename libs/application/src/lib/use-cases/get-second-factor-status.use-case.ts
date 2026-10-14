import type {
  SecondFactorRepositoryPort,
  SecretCipherPort,
} from '@kometio/ports';

export interface GetSecondFactorStatusDeps {
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    'findTotp' | 'countUnspentRecoveryCodes'
  >;
  /** `null` where the deployment has nowhere to keep a secret sealed. */
  secretCipher: SecretCipherPort | null;
}

export interface SecondFactorStatus {
  /** Whether this server can ask for a second step at all. */
  available: boolean;
  enabled: boolean;
  /** `0` when it is not on. */
  recoveryCodesLeft: number;
}

/** Where the person's second step of sign-in stands (docs/adr/0137): what the account screen draws it from. */
export async function getSecondFactorStatus(
  deps: GetSecondFactorStatusDeps,
  input: { tenantId: string; userId: string },
): Promise<SecondFactorStatus> {
  const factor = await deps.secondFactorRepository.findTotp(
    input.tenantId,
    input.userId,
  );
  const enabled = factor?.confirmedAt != null;
  return {
    available: deps.secretCipher !== null,
    enabled,
    recoveryCodesLeft: enabled
      ? await deps.secondFactorRepository.countUnspentRecoveryCodes(
          input.tenantId,
          input.userId,
        )
      : 0,
  };
}
