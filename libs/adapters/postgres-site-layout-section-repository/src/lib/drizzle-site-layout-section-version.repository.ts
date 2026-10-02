import { and, asc, eq } from 'drizzle-orm';
import type { SiteLayoutSectionVersion } from '@kometio/domain-core';
import type { SiteLayoutSectionVersionRepositoryPort } from '@kometio/ports';
import {
  type KometioDb,
  siteLayoutSectionVersions,
  withTenant,
} from '@kometio/postgres-db';
import { saveSiteLayoutSectionVersionTx } from './save-site-layout-section-version-tx';

function fromRow(
  row: typeof siteLayoutSectionVersions.$inferSelect,
): SiteLayoutSectionVersion {
  return row;
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleSiteLayoutSectionVersionRepository implements SiteLayoutSectionVersionRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async save(version: SiteLayoutSectionVersion): Promise<void> {
    await withTenant(this.db, version.tenantId, (tx) =>
      saveSiteLayoutSectionVersionTx(tx, version),
    );
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<SiteLayoutSectionVersion | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(siteLayoutSectionVersions)
        .where(
          and(
            eq(siteLayoutSectionVersions.tenantId, tenantId),
            eq(siteLayoutSectionVersions.id, versionId),
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /** Oldest first, matching the order used by the in-memory fake in application tests. */
  async listBySection(
    tenantId: string,
    siteLayoutSectionId: string,
  ): Promise<SiteLayoutSectionVersion[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(siteLayoutSectionVersions)
        .where(
          and(
            eq(siteLayoutSectionVersions.tenantId, tenantId),
            eq(
              siteLayoutSectionVersions.siteLayoutSectionId,
              siteLayoutSectionId,
            ),
          ),
        )
        .orderBy(asc(siteLayoutSectionVersions.createdAt)),
    );
    return rows.map(fromRow);
  }
}
