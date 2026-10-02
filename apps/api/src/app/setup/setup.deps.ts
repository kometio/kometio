import type { AuthPort, DeploymentBootstrapPort } from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';

/** What the setup module's use cases are built from (see moduleDeps). */
export interface SetupDeps {
  deploymentBootstrapPort: DeploymentBootstrapPort;
  authPort: AuthPort;
  tenant: DeploymentTenantResolver;
}
