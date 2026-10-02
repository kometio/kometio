import type {
  ImportJobRepositoryPort,
  SiteRepositoryPort,
  WordPressExportReaderPort,
} from '@kometio/ports';

/** What the imports module's use cases are built from (see moduleDeps). */
export interface ImportsDeps {
  importJobRepository: ImportJobRepositoryPort;
  siteRepository: SiteRepositoryPort;
  exportReader: WordPressExportReaderPort;
}
