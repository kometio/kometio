import { and, asc, eq } from 'drizzle-orm';
import type { PageGroupVersion } from '@kometio/domain-core';
import type { PageGroupVersionRepositoryPort } from '@kometio/ports';
import {
  type KometioDb,
  pageGroupVersions,
  withTenant,
} from '@kometio/postgres-db';
import { savePageGroupVersionTx } from './save-page-group-version-tx';

function fromRow(row: typeof pageGroupVersions.$inferSelect): PageGroupVersion {
  return row;
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzlePageGroupVersionRepository implements PageGroupVersionRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async save(version: PageGroupVersion): Promise<void> {
    await withTenant(this.db, version.tenantId, (tx) =>
      savePageGroupVersionTx(tx, version),
    );
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageGroupVersion | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(pageGroupVersions)
        .where(
          and(
            eq(pageGroupVersions.tenantId, tenantId),
            eq(pageGroupVersions.id, versionId),
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /** Oldest first, matching the order used by the in-memory fake in application tests. */
  async listByGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageGroupVersion[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(pageGroupVersions)
        .where(
          and(
            eq(pageGroupVersions.tenantId, tenantId),
            eq(pageGroupVersions.pageGroupId, pageGroupId),
          ),
        )
        .orderBy(asc(pageGroupVersions.createdAt)),
    );
    return rows.map(fromRow);
  }
}
