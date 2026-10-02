import { randomUUID } from 'node:crypto';
import { answeredRow } from './answered-row';
import { type KometioDb, withTenant } from './client';
import { sites, tenants, users } from './schema';

export type IntegrationSiteValues = Partial<
  Omit<typeof sites.$inferInsert, 'tenantId'>
>;
export type IntegrationUserValues = Partial<
  Omit<typeof users.$inferInsert, 'tenantId'>
>;

/**
 * The rows an integration spec creates before it can test anything — a
 * throwaway tenant, a site, a user — each written by hand in every spec
 * until these existed. The counterpart of integration-test-cleanup.ts:
 * a tenant made here goes away with `deleteIntegrationTenants`; a site or
 * user made under a shared tenant (`DEFAULT_TENANT_ID`) with
 * `deleteIntegrationFixtures`.
 *
 * Only what a spec does not care about is defaulted. A spec that asserts
 * on a value (a domain, a locale, a role) passes it, so the value stays
 * visible in the spec rather than hidden in here.
 */

/**
 * The name carries a random suffix: several suites create tenants against
 * the same database at once, and a readable label tells whose row is left
 * behind when a run dies before its cleanup.
 */
export async function createIntegrationTenant(
  db: KometioDb,
  label = 'Integration Tenant',
): Promise<string> {
  const inserted = await db
    .insert(tenants)
    .values({ name: `${label} ${randomUUID()}` })
    .returning({ id: tenants.id });
  return answeredRow(inserted, 'INSERT').id;
}

/** Inside `withTenant`: `sites` has an RLS policy, `tenants` has none. */
export async function createIntegrationSite(
  db: KometioDb,
  tenantId: string,
  values: IntegrationSiteValues = {},
): Promise<string> {
  const inserted = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(sites)
      .values({
        name: `Integration Site ${randomUUID()}`,
        defaultLocale: 'it',
        // The column's own default is no language at all, which no real
        // site has: its default language is always one it offers.
        enabledLocales: [values.defaultLocale ?? 'it'],
        ...values,
        tenantId,
      })
      .returning({ id: sites.id }),
  );
  return answeredRow(inserted, 'INSERT').id;
}

/**
 * The default password hash is not a hash of anything, so nobody can log
 * in as this user. A spec that logs in hashes a real password through its
 * `AuthPort` and passes it.
 */
export async function createIntegrationUser(
  db: KometioDb,
  tenantId: string,
  values: IntegrationUserValues = {},
): Promise<string> {
  const inserted = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(users)
      .values({
        email: `integration-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash',
        role: 'admin',
        ...values,
        tenantId,
      })
      .returning({ id: users.id }),
  );
  return answeredRow(inserted, 'INSERT').id;
}
