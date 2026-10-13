import { and, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import {
  Redirect,
  RedirectNotFoundError,
  RedirectSourceTakenError,
  type RedirectProps,
  type RedirectTarget,
} from '@kometio/domain-core';
import type {
  PaginatedResult,
  Pagination,
  RedirectListFilter,
  RedirectRepositoryPort,
} from '@kometio/ports';
import {
  describeRedirectSource,
  type RedirectSource,
} from '@kometio/shared-types';
import {
  DrizzlePaginatedRepository,
  answeredRow,
  type KometioDb,
  type KometioTx,
  isUniqueViolation,
  redirects,
  withTenant,
} from '@kometio/postgres-db';

const SOURCE_UNIQUE = 'redirects_site_source_unique';

type Row = typeof redirects.$inferSelect;

function targetOf(row: Row): RedirectTarget | null {
  if (row.targetKind === 'page') {
    return {
      kind: 'page',
      pageGroupId: row.targetPageGroupId,
      locale: row.targetLocale ?? '',
    };
  }
  if (row.targetKind === 'url' && row.targetUrl !== null) {
    return { kind: 'url', url: row.targetUrl };
  }
  return null;
}

function toProps(row: Row): RedirectProps {
  return {
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    source: { path: row.sourcePath, query: row.sourceQuery },
    kind: row.kind,
    target: targetOf(row),
    status: row.status === 302 ? 302 : row.status === 410 ? 410 : 301,
    origin: row.origin,
    hits: row.hits,
    lastHitAt: row.lastHitAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(redirect: Redirect): Row {
  const props = redirect.toProps();
  const target = props.target;
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    sourcePath: props.source.path,
    sourceQuery: props.source.query,
    kind: props.kind,
    targetKind: target?.kind ?? null,
    targetPageGroupId: target?.kind === 'page' ? target.pageGroupId : null,
    targetLocale: target?.kind === 'page' ? target.locale : null,
    targetUrl: target?.kind === 'url' ? target.url : null,
    status: props.status,
    origin: props.origin,
    hits: props.hits,
    lastHitAt: props.lastHitAt,
    createdBy: props.createdBy,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleRedirectRepository
  extends DrizzlePaginatedRepository<Row, Redirect>
  implements RedirectRepositoryPort
{
  protected readonly table = redirects;
  protected readonly idColumn = redirects.id;
  protected readonly tenantIdColumn = redirects.tenantId;

  constructor(db: KometioDb) {
    super(db);
  }

  protected toRow(redirect: Redirect) {
    return toRow(redirect);
  }

  protected fromRow(row: Row): Redirect {
    return Redirect.fromProps(toProps(row));
  }

  protected notFound(id: string): Error {
    return new RedirectNotFoundError(id);
  }

  override async add(redirect: Redirect): Promise<void> {
    try {
      await super.add(redirect);
    } catch (error) {
      throw this.translated(error, redirect.source);
    }
  }

  override async save(redirect: Redirect): Promise<void> {
    try {
      await super.save(redirect);
    } catch (error) {
      throw this.translated(error, redirect.source);
    }
  }

  private translated(error: unknown, source: RedirectSource): unknown {
    return isUniqueViolation(error, SOURCE_UNIQUE)
      ? new RedirectSourceTakenError(describeRedirectSource(source))
      : error;
  }

  async findBySource(
    tenantId: string,
    siteId: string,
    source: RedirectSource,
  ): Promise<Redirect | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(redirects)
        .where(
          and(
            eq(redirects.tenantId, tenantId),
            eq(redirects.siteId, siteId),
            eq(redirects.sourcePath, source.path),
            eq(redirects.sourceQuery, source.query),
          ),
        )
        .limit(1),
    );
    return rows[0] ? this.fromRow(rows[0]) : null;
  }

  async listBySite(tenantId: string, siteId: string): Promise<Redirect[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(redirects)
        .where(
          and(eq(redirects.tenantId, tenantId), eq(redirects.siteId, siteId)),
        ),
    );
    return rows.map((row) => this.fromRow(row));
  }

  async listPage(
    tenantId: string,
    siteId: string,
    filter: RedirectListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Redirect>> {
    const conditions: SQL[] = [
      eq(redirects.tenantId, tenantId),
      eq(redirects.siteId, siteId),
    ];
    const search = filter.search?.trim();
    if (search) {
      // A `%` or `_` typed by a person is text, not a wildcard.
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const matching = or(
        ilike(redirects.sourcePath, pattern),
        ilike(redirects.sourceQuery, pattern),
        ilike(redirects.targetUrl, pattern),
      );
      if (matching) conditions.push(matching);
    }
    if (filter.origin) conditions.push(eq(redirects.origin, filter.origin));
    if (filter.needsATarget) {
      conditions.push(
        eq(redirects.targetKind, 'page'),
        sql`${redirects.targetPageGroupId} is null`,
      );
    }
    return this.listPaginatedTx(
      tenantId,
      and(...conditions),
      redirects.updatedAt,
      pagination,
    );
  }

  async countBySite(tenantId: string, siteId: string): Promise<number> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ total: count() })
        .from(redirects)
        .where(
          and(eq(redirects.tenantId, tenantId), eq(redirects.siteId, siteId)),
        ),
    );
    return answeredRow(rows, 'COUNT').total;
  }

  async addHits(
    entries: readonly {
      tenantId: string;
      redirectId: string;
      hits: number;
      at: Date;
    }[],
  ): Promise<void> {
    const byTenant = new Map<string, typeof entries>();
    for (const entry of entries) {
      byTenant.set(entry.tenantId, [
        ...(byTenant.get(entry.tenantId) ?? []),
        entry,
      ]);
    }
    for (const [tenantId, rows] of byTenant) {
      await withTenant(this.db, tenantId, (tx) =>
        this.addHitsTx(tx, tenantId, rows),
      );
    }
  }

  private async addHitsTx(
    tx: KometioTx,
    tenantId: string,
    rows: readonly { redirectId: string; hits: number; at: Date }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const values = sql.join(
      rows.map(
        (row) =>
          sql`(${row.redirectId}::uuid, ${row.hits}::bigint, ${row.at.toISOString()}::timestamptz)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update redirects as r
      set hits = r.hits + v.hits,
          last_hit_at = greatest(coalesce(r.last_hit_at, v.at), v.at)
      from (values ${values}) as v(id, hits, at)
      where r.id = v.id and r.tenant_id = ${tenantId}
    `);
  }
}
