/**
 * Which tenants this deployment's database holds — asked only to learn
 * which one this deployment is (DeploymentTenantResolver). Kometio is
 * single-tenant per deployment (docs/adr/0010): more than one is a
 * misconfiguration to report, which is why the caller asks for a limit
 * rather than the whole list.
 */
export interface TenantDirectoryPort {
  listIds(limit: number): Promise<string[]>;
}
