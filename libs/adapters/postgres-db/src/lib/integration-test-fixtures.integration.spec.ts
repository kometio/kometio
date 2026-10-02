import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationSite,
  createIntegrationTenant,
  createIntegrationUser,
} from './integration-test-fixtures';
import { sites, tenants, users } from './schema';

/** Runs against a real Postgres — see docs/development.md. */
describe('integration-test-fixtures (integration)', () => {
  let db: KometioDb;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db, 'Fixtures Tenant');
    otherTenantId = await createIntegrationTenant(db);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId, otherTenantId]);
    await db.$client.end();
  });

  it('createIntegrationTenant names the tenant after its label, uniquely', async () => {
    const rows = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toMatch(/^Fixtures Tenant [0-9a-f-]{36}$/);
  });

  it('createIntegrationSite writes the site under its tenant, RLS included', async () => {
    const siteId = await createIntegrationSite(db, tenantId);

    const seenByOwner = await withTenant(db, tenantId, (tx) =>
      tx.select().from(sites).where(eq(sites.id, siteId)),
    );
    const seenByOther = await withTenant(db, otherTenantId, (tx) =>
      tx.select().from(sites).where(eq(sites.id, siteId)),
    );

    expect(seenByOwner).toHaveLength(1);
    expect(seenByOwner[0]).toMatchObject({ tenantId, defaultLocale: 'it' });
    expect(seenByOwner[0].name).toMatch(/^Integration Site /);
    expect(seenByOther).toHaveLength(0);
  });

  it('createIntegrationSite takes the values a spec cares about', async () => {
    const siteId = await createIntegrationSite(db, tenantId, {
      name: 'Bilingual',
      defaultLocale: 'en',
      enabledLocales: ['en', 'it'],
    });

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(sites).where(eq(sites.id, siteId)),
    );

    expect(row).toMatchObject({
      name: 'Bilingual',
      defaultLocale: 'en',
      enabledLocales: ['en', 'it'],
    });
  });

  it('createIntegrationUser writes an admin nobody can log in as by default', async () => {
    const userId = await createIntegrationUser(db, tenantId);

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(users).where(eq(users.id, userId)),
    );

    expect(row).toMatchObject({
      tenantId,
      role: 'admin',
      passwordHash: 'not-a-real-hash',
    });
    expect(row.email).toMatch(/^integration-[0-9a-f-]{36}@example\.test$/);
  });

  it('createIntegrationUser takes the values a spec cares about', async () => {
    const userId = await createIntegrationUser(db, tenantId, {
      role: 'editor',
      displayName: 'Ada',
      passwordHash: 'a-real-hash',
    });

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(users).where(eq(users.id, userId)),
    );

    expect(row).toMatchObject({
      role: 'editor',
      displayName: 'Ada',
      passwordHash: 'a-real-hash',
    });
  });
});
