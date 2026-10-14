import type {
  RedirectDeps,
  RedirectsFromWordPressDeps,
  ResolveRedirectDeps,
} from '@kometio/application';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';

/** What the admin routes' use cases are built from (see moduleDeps). */
export type RedirectsDeps = RedirectDeps & RedirectsFromWordPressDeps;

/** What the public site's one question is built from. */
export type PublicRedirectsDeps = ResolveRedirectDeps & {
  tenant: DeploymentTenantResolver;
};
