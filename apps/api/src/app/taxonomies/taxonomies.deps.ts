import type {
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';

/** What the taxonomies module's use cases are built from (see moduleDeps). */
export interface TaxonomiesDeps {
  taxonomyRepository: TaxonomyRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  siteRepository: SiteRepositoryPort;
}
