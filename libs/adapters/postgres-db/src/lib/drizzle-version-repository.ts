import { and, asc, eq } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { VersionRepositoryPort } from '@kometio/ports';
import { type KometioDb, type KometioTx, withTenant } from './client';
import { saveVersionTx } from './save-version-tx';

/**
 * What one table of versions is, said once: the table, the four columns the
 * queries and the retention policy need, and how to read the owner's id off
 * a version. Written as data beside the table's schema, so that the
 * repository that persists a version on its own and the aggregate that saves
 * one inside its own transaction cannot disagree about which table is which.
 *
 * Typed "widely" (`PgTable`/`AnyPgColumn`) for `DrizzlePaginatedRepository`'s
 * reason: TypeScript cannot correlate "this column belongs to this table"
 * across independent generics, and the one place that names them all
 * together, a few lines apart, is where that invariant is visible.
 */
export interface VersionTable<TVersion> {
  table: PgTable;
  columns: {
    id: AnyPgColumn;
    tenantId: AnyPgColumn;
    /** The column pointing at the thing being versioned (`page_group_id`, …). */
    owner: AnyPgColumn;
    createdAt: AnyPgColumn;
  };
  ownerIdOf(version: TVersion): string;
}

/**
 * Inserts one version inside the caller's transaction, and drops what the
 * retention policy no longer keeps: what an aggregate's repository calls when
 * it saves its content and the version of it together.
 */
export function saveVersionRowTx<
  TVersion extends { id: string; tenantId: string },
>(
  tx: KometioTx,
  versions: VersionTable<TVersion>,
  version: TVersion,
): Promise<void> {
  return saveVersionTx(
    tx,
    versions.table,
    versions.columns,
    version,
    versions.ownerIdOf(version),
  );
}

/**
 * The history of one kind of thing in one table: save, find one, list the
 * ones of an owner oldest first. There were four of these, written out, with
 * a method named for each owner (`listByGroup`, `listByTranslation`,
 * `listBySection` twice); the table's `VersionTable` is all that differed.
 *
 * Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
 */
export class DrizzleVersionRepository<
  TVersion extends { id: string; tenantId: string },
> implements VersionRepositoryPort<TVersion> {
  constructor(
    protected readonly db: KometioDb,
    private readonly versions: VersionTable<TVersion>,
  ) {}

  async save(version: TVersion): Promise<void> {
    await withTenant(this.db, version.tenantId, (tx) =>
      saveVersionRowTx(tx, this.versions, version),
    );
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<TVersion | null> {
    const { table, columns } = this.versions;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(columns.tenantId, tenantId), eq(columns.id, versionId)))
        .limit(1),
    );
    return this.asVersions(rows)[0] ?? null;
  }

  /** Oldest first, as every version listing is. */
  async listByOwner(tenantId: string, ownerId: string): Promise<TVersion[]> {
    const { table, columns } = this.versions;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(columns.tenantId, tenantId), eq(columns.owner, ownerId)))
        .orderBy(asc(columns.createdAt)),
    );
    return this.asVersions(rows);
  }

  /**
   * The one place a row becomes a version. A row of a version table has
   * exactly the fields of the domain's version (the tables are declared from
   * them); `PgTable` is typed too widely for the compiler to say so.
   */
  private asVersions(rows: unknown[]): TVersion[] {
    return rows as TVersion[];
  }
}
