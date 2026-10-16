import type {
  MediaStoragePort,
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
  SearchPort,
  SiteLayoutSectionRepositoryPort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';
import type { DeploymentSiteResolver } from '../sites/deployment-site.resolver';

/** What the public pages module's use cases are built from (see moduleDeps). */
export interface PublicPagesDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteRepository: SiteRepositoryPort;
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  searchPort: SearchPort;
  tenant: DeploymentTenantResolver;
  /** The one site this deployment serves — for what is the site's own and not asked of a domain (`newsletter`). */
  deploymentSiteResolver: DeploymentSiteResolver;
  previewTokenPort: PreviewTokenPort;
  userRepository: UserRepositoryPort;
  mediaStorage: MediaStoragePort;
}
