import type {
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the site layout sections module's use cases are built from (see moduleDeps). */
export interface SiteLayoutSectionsDeps {
  siteLayoutSectionRepository: SiteLayoutSectionRepositoryPort;
  siteLayoutSectionVersionRepository: SiteLayoutSectionVersionRepositoryPort;
  siteRepository: SiteRepositoryPort;
}
