import { and, eq } from 'drizzle-orm';
import { Site, SiteNotFoundError } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { type KometioDb, sites, withTenant } from '@kometio/postgres-db';

function fromRow(row: typeof sites.$inferSelect): Site {
  return Site.fromProps(row);
}

export class DrizzleSiteRepository implements SiteRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async findByDomain(tenantId: string, domain: string): Promise<Site | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(sites)
        .where(and(eq(sites.tenantId, tenantId), eq(sites.domain, domain)))
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findById(tenantId: string, id: string): Promise<Site | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(sites)
        .where(and(eq(sites.tenantId, tenantId), eq(sites.id, id)))
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<Site[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.select().from(sites).where(eq(sites.tenantId, tenantId)),
    );
    return rows.map(fromRow);
  }

  /** Written back, never created again: sites are created by the first-run setup, and one gone is not found. */
  async save(site: Site): Promise<void> {
    const row = site.toProps();
    const updated = await withTenant(this.db, row.tenantId, (tx) =>
      tx
        .update(sites)
        .set(row)
        .where(and(eq(sites.tenantId, row.tenantId), eq(sites.id, row.id)))
        .returning({ id: sites.id }),
    );
    if (updated.length === 0) throw new SiteNotFoundError(row.id);
  }
}
