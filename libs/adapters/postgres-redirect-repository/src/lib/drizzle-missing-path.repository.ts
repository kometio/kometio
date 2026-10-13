import { and, count, desc, eq, sql } from 'drizzle-orm';
import {
  MAX_MISSING_PATHS,
  MAX_MISSING_PATHS_HELD,
  type MissingPath,
  type MissingPathRepositoryPort,
  type PaginatedResult,
  type Pagination,
} from '@kometio/ports';
import {
  answeredRow,
  type KometioDb,
  missingPaths,
  withTenant,
} from '@kometio/postgres-db';

type Entry = Parameters<MissingPathRepositoryPort['record']>[0][number];

/**
 * The table is trimmed when it is this much over its size, and not at every
 * write: a delete that scans the site's rows after each flush is a cost a
 * quiet site would pay for nothing.
 */
const TRIM_AT = MAX_MISSING_PATHS_HELD;

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleMissingPathRepository implements MissingPathRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async record(entries: readonly Entry[]): Promise<void> {
    // One row per address in one statement: `on conflict` cannot touch a
    // row twice, and a batch that names an address twice means both counts.
    const merged = new Map<string, Entry>();
    for (const entry of entries) {
      const key = `${entry.tenantId}\0${entry.siteId}\0${entry.path}`;
      const known = merged.get(key);
      merged.set(
        key,
        known
          ? {
              ...known,
              hits: known.hits + entry.hits,
              at: known.at > entry.at ? known.at : entry.at,
            }
          : entry,
      );
    }
    const byTenant = new Map<string, Entry[]>();
    for (const entry of merged.values()) {
      byTenant.set(entry.tenantId, [
        ...(byTenant.get(entry.tenantId) ?? []),
        entry,
      ]);
    }

    for (const [tenantId, rows] of byTenant) {
      await withTenant(this.db, tenantId, async (tx) => {
        await tx
          .insert(missingPaths)
          .values(
            rows.map((row) => ({
              tenantId,
              siteId: row.siteId,
              path: row.path,
              hits: row.hits,
              firstSeenAt: row.at,
              lastSeenAt: row.at,
            })),
          )
          .onConflictDoUpdate({
            target: [missingPaths.siteId, missingPaths.path],
            set: {
              hits: sql`${missingPaths.hits} + excluded.hits`,
              lastSeenAt: sql`greatest(${missingPaths.lastSeenAt}, excluded.last_seen_at)`,
            },
          });

        for (const siteId of new Set(rows.map((row) => row.siteId))) {
          const total = answeredRow(
            await tx
              .select({ total: count() })
              .from(missingPaths)
              .where(
                and(
                  eq(missingPaths.tenantId, tenantId),
                  eq(missingPaths.siteId, siteId),
                ),
              ),
            'COUNT',
          ).total;
          if (total <= TRIM_AT) continue;
          // What is kept: what is still being asked for, most asked first;
          // what a person already dismissed goes before anything else.
          await tx.execute(sql`
            delete from missing_paths
            where id in (
              select id from missing_paths
              where tenant_id = ${tenantId} and site_id = ${siteId}
              order by dismissed asc, hits desc, last_seen_at desc
              offset ${MAX_MISSING_PATHS}
            )
          `);
        }
      });
    }
  }

  async list(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<MissingPath>> {
    const scope = and(
      eq(missingPaths.tenantId, tenantId),
      eq(missingPaths.siteId, siteId),
      eq(missingPaths.dismissed, false),
    );
    const [rows, totals] = await withTenant(this.db, tenantId, (tx) =>
      Promise.all([
        tx
          .select()
          .from(missingPaths)
          .where(scope)
          .orderBy(
            desc(missingPaths.hits),
            desc(missingPaths.lastSeenAt),
            desc(missingPaths.id),
          )
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize),
        tx.select({ total: count() }).from(missingPaths).where(scope),
      ]),
    );
    return {
      items: rows,
      total: answeredRow(totals, 'COUNT').total,
    };
  }

  async dismiss(tenantId: string, missingPathId: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(missingPaths)
        .set({ dismissed: true })
        .where(
          and(
            eq(missingPaths.tenantId, tenantId),
            eq(missingPaths.id, missingPathId),
          ),
        ),
    );
  }

  async clear(tenantId: string, siteId: string, path: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(missingPaths)
        .where(
          and(
            eq(missingPaths.tenantId, tenantId),
            eq(missingPaths.siteId, siteId),
            eq(missingPaths.path, path),
          ),
        ),
    );
  }
}
