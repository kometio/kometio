import type {
  AuthPort,
  DeploymentLocalePort,
  EmailPort,
  MediaStoragePort,
  SecondFactorRepositoryPort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

/** What the users module's use cases are built from (see moduleDeps). */
export interface UsersDeps {
  userRepository: UserRepositoryPort;
  authPort: AuthPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
  /** The language an email falls back to for somebody who has not chosen one (docs/adr/0100). */
  deploymentLocale: DeploymentLocalePort;
  mediaStorage: MediaStoragePort;
  /** Who has the second step of sign-in on, and the reset an administrator may make (docs/adr/0137). */
  secondFactorRepository: SecondFactorRepositoryPort;
}
