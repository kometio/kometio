/**
 * A one-off migration: it moves a block's LOOK out of its props and onto
 * `Block.variant` (ADR-0047) — today that is `Button.props.variant`, the
 * one prop of the three emitting a modifier class that is presentation
 * rather than meaning.
 *
 * Unlike the responsive-style migration, this one DOES have to run:
 * `buttonPropsSchema` no longer declares `variant`, so a Button whose look
 * still lives in props parses to a Button with no look at all and renders
 * as the default. Nothing is lost — the value is still in the JSONB until
 * the next save — but the page looks wrong until this runs.
 *
 * The declared variants come from the block registry, so a stored value
 * that is not one of them is dropped: that retires the old `'primary'`,
 * which named the default look rather than a variant.
 *
 * Idempotent: a block already migrated has no such prop and is not
 * rewritten. `tenants` has no RLS (it is the root table, see schema.ts);
 * every content table below it requires `withTenant`.
 */
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { migrateVariantProps } from '@kometio/shared-types';
import { createAppDb, withTenant, type KometioDb } from '../src/lib/client';
import { tenants } from '../src/lib/schema';
import { visitStoredContent } from './visit-stored-content';

const declaredVariants = Object.fromEntries(
  [...pageBlocks, ...headerFooterBlocks]
    .filter((descriptor) => descriptor.variants?.length)
    .map((descriptor) => [
      descriptor.type,
      (descriptor.variants ?? []).map((variant) => variant.value),
    ]),
);

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  let migrated = 0;
  let untouched = 0;

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      const totals = await visitStoredContent(tx, tenant.id, (content) =>
        migrateVariantProps(content, declaredVariants),
      );
      migrated += totals.rewritten;
      untouched += totals.untouched;
    });
  }

  console.log(
    `Variant prop migration complete: ${migrated} rows rewritten, ${untouched} already current (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
