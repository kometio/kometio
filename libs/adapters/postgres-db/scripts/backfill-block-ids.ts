/**
 * A one-off backfill: it assigns a stable id to every existing block that
 * lacks one, across page content and its versions, published snapshots,
 * diverged translations, and the header/footer sections and theirs — see
 * the visual editor plan, Day 1: an id assigned once, forever, before the
 * new editor touches any content (selection, dragging and fragment
 * patching are all addressed by id). Idempotent: it regenerates only where
 * one is missing, and never touches an id that is already there — safe to
 * re-run.
 *
 * To be run once, during a maintenance window, BEFORE deploying any code
 * that requires the id in the Zod schema (see content-model.ts).
 *
 * Repaired on 2026-09-07 (ADR-0047's branch): it still read `pages` and
 * `pageVersions`, tables the i18n rework replaced with `page_groups` and
 * `page_translations`, so it could not run at all — while ADR-0046 tells
 * self-hosters to run it. `scripts/` was outside the typecheck target,
 * which is why nothing said so; it is inside it now. The table list lives
 * in `visit-stored-content.ts`, shared with the other one-off script
 * rather than copied.
 *
 * `tenants` has no RLS (it is the root table, see schema.ts) — readable
 * directly with the kometio_app connection. Every content table below it is
 * tenant-scoped instead and requires `withTenant`.
 */
import { backfillBlockIds } from '@kometio/shared-types';
import { createAppDb, withTenant, type KometioDb } from '../src/lib/client';
import { tenants } from '../src/lib/schema';
import { visitStoredContent } from './visit-stored-content';

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  let backfilled = 0;
  let untouched = 0;

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      const totals = await visitStoredContent(tx, tenant.id, backfillBlockIds);
      backfilled += totals.rewritten;
      untouched += totals.untouched;
    });
  }

  console.log(
    `Block id backfill complete: ${backfilled} rows updated, ${untouched} already had ids (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
