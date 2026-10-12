import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  type VersionTable,
  siteLayoutSectionVersions,
  saveVersionRowTx,
} from '@kometio/postgres-db';

/** The table of the header's and the footer's versions. */
export const siteLayoutSectionVersionTable: VersionTable<SiteLayoutSectionVersion> =
  {
    table: siteLayoutSectionVersions,
    columns: {
      id: siteLayoutSectionVersions.id,
      tenantId: siteLayoutSectionVersions.tenantId,
      owner: siteLayoutSectionVersions.siteLayoutSectionId,
      createdAt: siteLayoutSectionVersions.createdAt,
    },
    ownerIdOf: (version) => version.siteLayoutSectionId,
  };

/**
 * Inserts the header's or footer's version, inside the caller's `tx`.
 * Retention lives in `saveVersionTx`.
 */
export function saveSiteLayoutSectionVersionTx(
  tx: KometioTx,
  version: SiteLayoutSectionVersion,
): Promise<void> {
  return saveVersionRowTx(tx, siteLayoutSectionVersionTable, version);
}
