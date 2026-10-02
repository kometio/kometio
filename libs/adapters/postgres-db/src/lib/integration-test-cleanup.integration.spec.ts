import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb } from './client';
import {
  deleteIntegrationFixtures,
  deleteIntegrationTenants,
} from './integration-test-cleanup';
import {
  createIntegrationSite,
  createIntegrationTenant,
  createIntegrationUser,
} from './integration-test-fixtures';
import { sites, tenants, users } from './schema';
import { withTenant } from './client';

/** Runs against a real Postgres — see docs/development.md. */
describe('integration-test-cleanup (integration)', () => {
  let db: KometioDb;

  beforeAll(() => {
    db = createAppDb();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('deleteIntegrationTenants cascades away everything under the given tenants', async () => {
    const tenantId = await createIntegrationTenant(db, 'Cleanup Test Tenant');
    await createIntegrationSite(db, tenantId);

    await deleteIntegrationTenants(db, [tenantId]);

    const remaining = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    expect(remaining).toHaveLength(0);
  });

  it('deleteIntegrationTenants is a no-op for an empty list', async () => {
    await expect(deleteIntegrationTenants(db, [])).resolves.toBeUndefined();
  });

  it('deleteIntegrationFixtures deletes only the given site/user ids, scoped to the tenant', async () => {
    const tenantId = process.env.DEFAULT_TENANT_ID as string;
    const siteId = await createIntegrationSite(db, tenantId);
    const userId = await createIntegrationUser(db, tenantId);

    await deleteIntegrationFixtures(db, tenantId, {
      siteIds: [siteId],
      userIds: [userId],
    });

    const [remainingSite, remainingUser] = await Promise.all([
      withTenant(db, tenantId, (tx) =>
        tx.select().from(sites).where(eq(sites.id, siteId)),
      ),
      withTenant(db, tenantId, (tx) =>
        tx.select().from(users).where(eq(users.id, userId)),
      ),
    ]);
    expect(remainingSite).toHaveLength(0);
    expect(remainingUser).toHaveLength(0);
  });

  it('deleteIntegrationFixtures is a no-op when both id lists are empty', async () => {
    const tenantId = process.env.DEFAULT_TENANT_ID as string;
    await expect(
      deleteIntegrationFixtures(db, tenantId, {}),
    ).resolves.toBeUndefined();
  });
});
