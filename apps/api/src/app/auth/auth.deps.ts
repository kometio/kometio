import type {
  AuthPort,
  CaptchaPort,
  DeploymentLocalePort,
  EmailPort,
  SecondFactorRepositoryPort,
  SecretCipherPort,
  TotpPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';

/** What signing in, out and back in is built from (see moduleDeps). */
export interface AuthDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
  /** The language an email falls back to for somebody who has not chosen one (docs/adr/0100). */
  deploymentLocale: DeploymentLocalePort;
  captchaPort: CaptchaPort;
  /** The one tenant a sign-in on this deployment belongs to. */
  tenant: DeploymentTenantResolver;
  /** The second step of a sign-in, for the people who switched it on (docs/adr/0137). */
  secondFactorRepository: SecondFactorRepositoryPort;
  totpPort: TotpPort;
  /** `null` where nothing is sealed: only a recovery code can then be given. */
  secretCipher: SecretCipherPort | null;
}
