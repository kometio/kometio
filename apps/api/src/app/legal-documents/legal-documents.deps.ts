import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the legal documents module's use cases are built from (see moduleDeps). */
export interface LegalDocumentsDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}
