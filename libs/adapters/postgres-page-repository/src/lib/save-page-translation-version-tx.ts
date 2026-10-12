import type { PageTranslationVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  type VersionTable,
  pageTranslationVersions,
  saveVersionRowTx,
} from '@kometio/postgres-db';

/** The table of one language's versions: its overlay and seoMeta, and its own tree when it is unlinked. */
export const pageTranslationVersionTable: VersionTable<PageTranslationVersion> =
  {
    table: pageTranslationVersions,
    columns: {
      id: pageTranslationVersions.id,
      tenantId: pageTranslationVersions.tenantId,
      owner: pageTranslationVersions.pageTranslationId,
      createdAt: pageTranslationVersions.createdAt,
    },
    ownerIdOf: (version) => version.pageTranslationId,
  };

/**
 * Inserts one language's version, inside the caller's `tx`. Retention lives
 * in `saveVersionTx`.
 */
export function savePageTranslationVersionTx(
  tx: KometioTx,
  version: PageTranslationVersion,
): Promise<void> {
  return saveVersionRowTx(tx, pageTranslationVersionTable, version);
}
