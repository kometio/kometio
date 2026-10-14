/**
 * A one-off pass that rewrites every rich text value already in the
 * database into the shape `kind: 'richtext'` expects (ADR-0046): HTML,
 * sanitised, with `&` and `<` escaped in what used to be plain text.
 *
 * Unlike the block-id backfill this is modelled on, it is NOT a
 * precondition for deploying. `normalizeRichText` runs on the write path
 * (apps/api) and again on the read path (apps/public-site), and it is
 * idempotent, so an installation that never runs this still renders
 * correctly — the scripts in this repo are executed by hand, and a
 * self-hoster who upgrades without reading the release notes should not
 * lose the text on their site.
 *
 * What it buys is a database that holds one shape rather than two: the
 * search index, exports and the API's own responses then see HTML
 * everywhere, and the read-path normalisation becomes belt to the write
 * path's braces rather than load-bearing.
 *
 * Safe to re-run. It writes only where a value actually changed.
 */
import { createAppDb, withTenant, type KometioDb } from '../src/lib/client';
import { normalizeStoredRichText } from '../src/lib/normalize-stored-rich-text';
import { tenants } from '../src/lib/schema';

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  let rewritten = 0;
  let untouched = 0;
  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      const totals = await normalizeStoredRichText(tx, tenant.id);
      rewritten += totals.rewritten;
      untouched += totals.untouched;
    });
  }

  console.log(
    `Rich text normalised: ${rewritten} rows rewritten, ${untouched} already in shape (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
