import type { PageGroupVersion } from '@kometio/domain-core';
import { DrizzleVersionRepository, type KometioDb } from '@kometio/postgres-db';
import { pageGroupVersionTable } from './save-page-group-version-tx';

/** The history of a page's shared structure. */
export class DrizzlePageGroupVersionRepository extends DrizzleVersionRepository<PageGroupVersion> {
  constructor(db: KometioDb) {
    super(db, pageGroupVersionTable);
  }
}
