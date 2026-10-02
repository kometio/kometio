import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  SearchPort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the reusable sections module's use cases are built from (see moduleDeps). */
export interface ReusableSectionsDeps {
  siteRepository: SiteRepositoryPort;
  reusableSectionRepository: ReusableSectionRepositoryPort;
  reusableSectionVersionRepository: ReusableSectionVersionRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  searchPort: SearchPort;
  previewTokenPort: PreviewTokenPort;
}
