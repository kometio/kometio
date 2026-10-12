import type { PageTranslationVersion } from '@kometio/domain-core';
import type { VersionRepositoryPort } from './version-repository.port';

/** The history of one language of a page: `listByOwner` takes its id. */
export type PageTranslationVersionRepositoryPort =
  VersionRepositoryPort<PageTranslationVersion>;
