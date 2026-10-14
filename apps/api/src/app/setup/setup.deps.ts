import type {
  AuthPort,
  DeploymentBootstrapPort,
  SiteImportPort,
} from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';

/** What the setup module's use cases are built from (see moduleDeps). */
export interface SetupDeps {
  deploymentBootstrapPort: DeploymentBootstrapPort;
  // What the first run asks of them: it signs the account in and then tells the
  // resolver there is a tenant now.
  authPort: Pick<AuthPort, 'hashPassword' | 'createSession'>;
  tenant: Pick<DeploymentTenantResolver, 'refresh'>;
  /** `null` where the launcher of the single image is not there to open an archive (docs/adr/0106). */
  siteImport: SiteImportPort | null;
}
