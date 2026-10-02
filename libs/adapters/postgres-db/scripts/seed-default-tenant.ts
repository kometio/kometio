/**
 * Creates the single tenant + site this self-hosted instance serves — see
 * docs/adr/0010-session-based-auth-foundations.md for why DEFAULT_TENANT_ID
 * survives auth (Phase 3) as the bootstrap constant login uses before a
 * session exists, in this single-tenant-per-deployment MVP model.
 * Idempotent: safe to run on every deploy/dev startup.
 */
import { requireEnv } from '@kometio/env-config';
import { createAppDb, withTenant } from '../src/lib/client';
import { sites, tenants } from '../src/lib/schema';

async function main() {
  const tenantId = requireEnv('DEFAULT_TENANT_ID');
  const siteId = requireEnv('DEFAULT_SITE_ID');
  const db = createAppDb();

  await db
    .insert(tenants)
    .values({ id: tenantId, name: 'Default tenant' })
    .onConflictDoNothing();

  await withTenant(db, tenantId, (tx) =>
    tx
      .insert(sites)
      .values({
        id: siteId,
        tenantId,
        name: 'Default site',
        // apps/public-site resolves which site to render from the request's
        // Host header (see public-pages.use-case.ts) — 'localhost' lets
        // `pnpm nx dev public-site` work against this seeded site out of
        // the box. Real deployments update this to their actual domain.
        domain: 'localhost',
        defaultLocale: 'it',
        // Must include defaultLocale (see @kometio/shared-types'
        // localeSettingsSchema) — a freshly seeded site starts with just
        // its one default locale enabled, same as the DB column default
        // would otherwise leave it inconsistent (`[]`).
        enabledLocales: ['it'],
      })
      .onConflictDoNothing(),
  );

  console.log(`Seeded tenant ${tenantId} / site ${siteId}`);
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
