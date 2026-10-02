import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { KometioTx } from './client';

/**
 * The retention policy every version table shares: keep the last N, prune
 * inline after each save, no scheduled job (PR #94).
 */
const MAX_VERSIONS_TO_KEEP = 10;

/**
 * Insert one version row and prune the owner's history beyond the cap,
 * inside the caller's transaction.
 *
 * Written once here because it had been written four times: page groups,
 * page translations, site layout sections and — before the squash — pages,
 * each a copy of the same three statements with the table and the owning
 * column swapped. Adding a fifth for reusable sections (docs/adr/0059) is
 * what made keeping them separate indefensible: the cap is a policy, and a
 * policy stored in four places drifts to four values.
 *
 * The columns are passed alongside the table rather than derived from it,
 * for `DrizzlePaginatedRepository`'s reason: TypeScript cannot correlate
 * "this column belongs to this table" across the generics, and the caller
 * — which names all of them together, one line apart — is where that
 * invariant is actually visible.
 */
export async function saveVersionTx<
  TRow extends { id: string; tenantId: string },
>(
  tx: KometioTx,
  table: PgTable,
  columns: {
    id: AnyPgColumn;
    tenantId: AnyPgColumn;
    /** The column pointing at the thing being versioned (`page_group_id`, …). */
    owner: AnyPgColumn;
    createdAt: AnyPgColumn;
  },
  row: TRow,
  ownerId: string,
): Promise<void> {
  await tx.insert(table).values(row as Record<string, unknown>);

  const ownedByThis = and(
    eq(columns.tenantId, row.tenantId),
    eq(columns.owner, ownerId),
  );

  const recent = await tx
    .select({ id: columns.id })
    .from(table)
    .where(ownedByThis)
    .orderBy(desc(columns.createdAt))
    .limit(MAX_VERSIONS_TO_KEEP);
  const keepIds = recent.map((keep) => keep.id);
  // `keepIds` always holds at least the row inserted above, so this never
  // fires in practice — but `notInArray([])` matches everything, which
  // would delete the entire history it was called to protect.
  if (keepIds.length === 0) {
    return;
  }

  await tx
    .delete(table)
    .where(and(ownedByThis, notInArray(columns.id, keepIds)));
}
