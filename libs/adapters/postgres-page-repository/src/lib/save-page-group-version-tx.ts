import type { PageGroupVersion } from '@kometio/domain-core';
import {
  type KometioTx,
  type VersionTable,
  pageGroupVersions,
  saveVersionRowTx,
} from '@kometio/postgres-db';

/** The table of the SHARED structure's versions: a parallel versioning stream to the per-language one (`pageTranslationVersionTable`). */
export const pageGroupVersionTable: VersionTable<PageGroupVersion> = {
  table: pageGroupVersions,
  columns: {
    id: pageGroupVersions.id,
    tenantId: pageGroupVersions.tenantId,
    owner: pageGroupVersions.pageGroupId,
    createdAt: pageGroupVersions.createdAt,
  },
  ownerIdOf: (version) => version.pageGroupId,
};

/**
 * Inserts the SHARED structure's version, inside the caller's `tx`, for an
 * aggregate that saves its content and the version of it together.
 * Retention lives in `saveVersionTx`.
 */
export function savePageGroupVersionTx(
  tx: KometioTx,
  version: PageGroupVersion,
): Promise<void> {
  return saveVersionRowTx(tx, pageGroupVersionTable, version);
}
