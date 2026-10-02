import type {
  ContentSanitizerPort,
  CollectionRepositoryPort,
  PageGroupRepositoryPort,
  PageGroupVersionRepositoryPort,
  PageTranslationRepositoryPort,
  PageTranslationVersionRepositoryPort,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  SearchPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';

/** What the pages module's use cases are built from (see moduleDeps). */
export interface PagesDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageGroupVersionRepository: PageGroupVersionRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  pageTranslationVersionRepository: PageTranslationVersionRepositoryPort;
  previewTokenPort: PreviewTokenPort;
  searchPort: SearchPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  taxonomyRepository: TaxonomyRepositoryPort;
  siteRepository: SiteRepositoryPort;
  contentSanitizer: ContentSanitizerPort;
  collectionRepository: CollectionRepositoryPort;
  reusableSectionVersionRepository: ReusableSectionVersionRepositoryPort;
}
