import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  siteLayoutSectionVersions,
  saveVersionTx,
} from '@kometio/postgres-db';

/**
 * Inserts the header's or footer's version, inside the caller's `tx`.
 * Retention lives in `saveVersionTx`.
 */
export async function saveSiteLayoutSectionVersionTx(
  tx: KometioTx,
  version: SiteLayoutSectionVersion,
): Promise<void> {
  await saveVersionTx(
    tx,
    siteLayoutSectionVersions,
    {
      id: siteLayoutSectionVersions.id,
      tenantId: siteLayoutSectionVersions.tenantId,
      owner: siteLayoutSectionVersions.siteLayoutSectionId,
      createdAt: siteLayoutSectionVersions.createdAt,
    },
    version,
    version.siteLayoutSectionId,
  );
}
