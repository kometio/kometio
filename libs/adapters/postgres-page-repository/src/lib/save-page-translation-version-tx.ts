import type { PageTranslationVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  pageTranslationVersions,
  saveVersionTx,
} from '@kometio/postgres-db';

/**
 * Inserts one language's version: its overlay and seoMeta, and its own
 * tree when it is unlinked. Retention lives in `saveVersionTx`.
 */
export async function savePageTranslationVersionTx(
  tx: KometioTx,
  version: PageTranslationVersion,
): Promise<void> {
  await saveVersionTx(
    tx,
    pageTranslationVersions,
    {
      id: pageTranslationVersions.id,
      tenantId: pageTranslationVersions.tenantId,
      owner: pageTranslationVersions.pageTranslationId,
      createdAt: pageTranslationVersions.createdAt,
    },
    version,
    version.pageTranslationId,
  );
}
