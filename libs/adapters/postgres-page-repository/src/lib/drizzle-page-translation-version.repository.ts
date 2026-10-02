import { and, asc, eq } from 'drizzle-orm';
import type { PageTranslationVersion } from '@kometio/domain-core';
import type { PageTranslationVersionRepositoryPort } from '@kometio/ports';
import {
  type KometioDb,
  pageTranslationVersions,
  withTenant,
} from '@kometio/postgres-db';
import { savePageTranslationVersionTx } from './save-page-translation-version-tx';

function fromRow(
  row: typeof pageTranslationVersions.$inferSelect,
): PageTranslationVersion {
  return row;
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzlePageTranslationVersionRepository implements PageTranslationVersionRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async save(version: PageTranslationVersion): Promise<void> {
    await withTenant(this.db, version.tenantId, (tx) =>
      savePageTranslationVersionTx(tx, version),
    );
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageTranslationVersion | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(pageTranslationVersions)
        .where(
          and(
            eq(pageTranslationVersions.tenantId, tenantId),
            eq(pageTranslationVersions.id, versionId),
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /** Oldest first, matching the order used by the in-memory fake in application tests. */
  async listByTranslation(
    tenantId: string,
    pageTranslationId: string,
  ): Promise<PageTranslationVersion[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(pageTranslationVersions)
        .where(
          and(
            eq(pageTranslationVersions.tenantId, tenantId),
            eq(pageTranslationVersions.pageTranslationId, pageTranslationId),
          ),
        )
        .orderBy(asc(pageTranslationVersions.createdAt)),
    );
    return rows.map(fromRow);
  }
}
