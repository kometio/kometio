import type { PageGroupVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  pageGroupVersions,
  saveVersionTx,
} from '@kometio/postgres-db';

/**
 * Inserts the SHARED structure's version, inside the caller's `tx` — a
 * parallel versioning stream to savePageTranslationVersionTx, which
 * carries the per-locale text. The retention policy itself lives in
 * `saveVersionTx` now: it was the same three statements in four files.
 */
export async function savePageGroupVersionTx(
  tx: KometioTx,
  version: PageGroupVersion,
): Promise<void> {
  await saveVersionTx(
    tx,
    pageGroupVersions,
    {
      id: pageGroupVersions.id,
      tenantId: pageGroupVersions.tenantId,
      owner: pageGroupVersions.pageGroupId,
      createdAt: pageGroupVersions.createdAt,
    },
    version,
    version.pageGroupId,
  );
}
