import type {
  AuthPort,
  SecondFactorRepositoryPort,
  SecretCipherPort,
  TotpPort,
  UserRepositoryPort,
} from '@kometio/ports';

/** What turning the second step of sign-in on and off is built from (see moduleDeps). */
export interface SecondFactorDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  secondFactorRepository: SecondFactorRepositoryPort;
  totpPort: TotpPort;
  /** `null` where the deployment has nowhere to keep a secret sealed: the second step is not offered. */
  secretCipher: SecretCipherPort | null;
}
