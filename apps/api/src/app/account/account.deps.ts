import type {
  AuthPort,
  DeploymentLocalePort,
  EmailPort,
  MediaStoragePort,
  UserRepositoryPort,
  VerificationTokenPort,
} from '@kometio/ports';

/** What the account module's use cases are built from (see moduleDeps). */
export interface AccountDeps {
  userRepository: UserRepositoryPort;
  mediaStorage: MediaStoragePort;
  authPort: AuthPort;
  verificationTokenPort: VerificationTokenPort;
  emailPort: EmailPort;
  /** The language an email falls back to for somebody who has not chosen one (docs/adr/0100). */
  deploymentLocale: DeploymentLocalePort;
}
