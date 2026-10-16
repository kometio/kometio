import type {
  CaptchaPort,
  NewsletterPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';
import type { DeploymentSiteResolver } from '../sites/deployment-site.resolver';

/** What the public newsletter module's use cases are built from (see moduleDeps). */
export interface PublicNewsletterDeps {
  captchaPort: CaptchaPort;
  newsletterPort: NewsletterPort;
  /** Whose setting says whether a captcha is asked for (docs/adr/0145). */
  siteRepository: SiteRepositoryPort;
  tenant: DeploymentTenantResolver;
  deploymentSiteResolver: DeploymentSiteResolver;
}
