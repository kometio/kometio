import type {
  FormSubmissionRepositoryPort,
  MediaRepositoryPort,
  MediaStoragePort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  ThemeCatalogPort,
} from '@kometio/ports';
import type { DeploymentSiteResolver } from './deployment-site.resolver';

/** What the sites module's use cases are built from (see moduleDeps). */
export interface SitesDeps {
  siteRepository: SiteRepositoryPort;
  formSubmissionRepository: FormSubmissionRepositoryPort;
  siteThemeBlockStylesRepository: SiteThemeBlockStylesPort;
  themeCatalog: ThemeCatalogPort;
  deploymentSiteResolver: DeploymentSiteResolver;
  /** The files of the font a site uploaded are checked against its library (docs/adr/0147). */
  mediaRepository: MediaRepositoryPort;
  mediaStorage: MediaStoragePort;
}
