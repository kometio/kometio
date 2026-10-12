import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import { DrizzleVersionRepository, type KometioDb } from '@kometio/postgres-db';
import { siteLayoutSectionVersionTable } from './save-site-layout-section-version-tx';

/** The history of the header or the footer. */
export class DrizzleSiteLayoutSectionVersionRepository extends DrizzleVersionRepository<SiteLayoutSectionVersion> {
  constructor(db: KometioDb) {
    super(db, siteLayoutSectionVersionTable);
  }
}
