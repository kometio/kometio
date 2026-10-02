/**
 * A one-off migration: it rewrites every block style still in the flat,
 * pre-ADR-0047 shape as the per-breakpoint one — `{ minHeight: '60vh' }`
 * becomes `{ base: { minHeight: '60vh' } }` — across page content and its
 * versions, published snapshots, diverged translations, header/footer
 * sections and theirs, and the per-type styles in
 * `site_theme_block_styles`. Idempotent: a row already migrated is left
 * exactly as it is and not rewritten, so it is safe to re-run.
 *
 * Unlike `backfill-block-ids.ts`, this does NOT have to run before the new
 * code: both shapes are read correctly either way (`blockSchema`
 * normalizes on parse, `normalizeResponsiveBlockStyle` at the database
 * boundary). What it buys is that only one shape is left in the tables —
 * otherwise every future reader, and every query written against the
 * JSONB, has to keep handling both forever.
 *
 * `tenants` has no RLS (it is the root table, see schema.ts) — readable
 * directly with the kometio_app connection. Every content table below it is
 * tenant-scoped instead and requires `withTenant`.
 */
import {
  migrateResponsiveBlockStyles,
  migrateStyle,
} from '@kometio/shared-types';
import { and, eq } from 'drizzle-orm';
import {
  createAppDb,
  withTenant,
  type KometioDb,
  type KometioTx,
} from '../src/lib/client';
import { siteThemeBlockStyles, tenants } from '../src/lib/schema';
import { visitStoredContent } from './visit-stored-content';

let migrated = 0;
let untouched = 0;

/** The per-TYPE tier (docs/adr/0022), one row per (site, block type) — the same shape change, in its own table rather than inside a page's content. */
async function migrateThemeBlockStyles(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select()
    .from(siteThemeBlockStyles)
    .where(eq(siteThemeBlockStyles.tenantId, tenantId));

  for (const row of rows) {
    const result = migrateStyle(row.style);
    if (!result.changed || !result.style) {
      untouched += 1;
      continue;
    }
    await tx
      .update(siteThemeBlockStyles)
      .set({ style: result.style })
      .where(
        and(
          eq(siteThemeBlockStyles.siteId, row.siteId),
          eq(siteThemeBlockStyles.blockType, row.blockType),
        ),
      );
    migrated += 1;
  }
}

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();

  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      const totals = await visitStoredContent(
        tx,
        tenant.id,
        migrateResponsiveBlockStyles,
      );
      migrated += totals.rewritten;
      untouched += totals.untouched;
      await migrateThemeBlockStyles(tx, tenant.id);
    });
  }

  console.log(
    `Responsive block style migration complete: ${migrated} rows rewritten, ${untouched} already current (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
