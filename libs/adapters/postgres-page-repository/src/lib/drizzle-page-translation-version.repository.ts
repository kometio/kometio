import type { PageTranslationVersion } from '@kometio/domain-core';
import { DrizzleVersionRepository, type KometioDb } from '@kometio/postgres-db';
import { pageTranslationVersionTable } from './save-page-translation-version-tx';

/** The history of one language of a page. */
export class DrizzlePageTranslationVersionRepository extends DrizzleVersionRepository<PageTranslationVersion> {
  constructor(db: KometioDb) {
    super(db, pageTranslationVersionTable);
  }
}
