/**
 * A one-off migration: it rewrites `Columns.layout` — the three fixed
 * presets ADR-0050 replaced — into a `span` on each child column.
 *
 * Only one of the three actually needed converting. `two-equal` and
 * `three-equal` produce the same layout a row with no widths produces
 * anyway, and `columnsPropsSchema` simply ignores the leftover prop, so
 * nothing breaks if this never runs for them. `two-asymmetric` is the
 * reason it exists: it rendered `3fr 7fr`, and without conversion those
 * rows quietly become 50/50 — a page that changes appearance on deploy,
 * which is the one failure a schema change must not cause silently.
 *
 * Idempotent: the prop is dropped as it is read, so a row already
 * migrated has nothing to match on and is not rewritten. `tenants` has no
 * RLS (it is the root table, see schema.ts); every content table below it
 * requires `withTenant`.
 */
import { migrateColumnsLayout } from '@kometio/shared-types';
import { createAppDb, withTenant, type KometioDb } from '../src/lib/client';
import { tenants } from '../src/lib/schema';
import { visitStoredContent } from './visit-stored-content';

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  let migrated = 0;
  let untouched = 0;

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      const totals = await visitStoredContent(tx, tenant.id, (content) =>
        migrateColumnsLayout(content),
      );
      migrated += totals.rewritten;
      untouched += totals.untouched;
    });
  }

  console.log(
    `Columns layout migration complete: ${migrated} rows rewritten, ${untouched} already current (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
