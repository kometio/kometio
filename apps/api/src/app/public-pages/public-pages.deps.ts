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
  previewTokenPort: PreviewTokenPort;
  userRepository: UserRepositoryPort;
  mediaStorage: MediaStoragePort;
}
