import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import { createIntegrationTenant } from './integration-test-fixtures';
import { sites } from './schema';

/**
 * Runs against a real Postgres — see docs/development.md ("docker compose up
 * -d postgres" + run migrations first). Exercises the actual
 * set_config()/RLS wiring that DrizzlePageRepository's integration test
 * relies on, but in isolation from any repository code.
 */
describe('withTenant (integration)', () => {
  let db: KometioDb;
  const createdTenantIds: string[] = [];

  beforeAll(() => {
    db = createAppDb();
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, createdTenantIds);
    await db.$client.end();
  });

  it('scopes app.current_tenant_id to the transaction', async () => {
    const tenantId = randomUUID();

    const [{ value }] = await withTenant(db, tenantId, (tx) =>
      tx.execute(
        sql`select current_setting('app.current_tenant_id', true) as value`,
      ),
    );
    expect(value).toBe(tenantId);

    // outside withTenant, the setting must not leak to later transactions
    const [{ value: afterValue }] = await db.execute(
      sql`select current_setting('app.current_tenant_id', true) as value`,
    );
    expect(afterValue).not.toBe(tenantId);
  });

  it('rows inserted under one tenant are invisible under another (RLS)', async () => {
    // tenants itself carries no RLS policy (see drizzle/0000_baseline_schema.sql
    // — it lists tenants, not tenant-owned data), so exercise the policy via
    // `sites`, which does.
    const tenantAId = await createIntegrationTenant(db, 'Tenant A');
    const tenantBId = await createIntegrationTenant(db, 'Tenant B');
    createdTenantIds.push(tenantAId, tenantBId);

    await withTenant(db, tenantAId, (tx) =>
      tx
        .insert(sites)
        .values({ tenantId: tenantAId, name: 'Site A', defaultLocale: 'it' }),
    );

    const visibleToA = await withTenant(db, tenantAId, (tx) =>
      tx
        .select()
        .from(sites)
        .where(sql`${sites.tenantId} = ${tenantAId}`),
    );
    expect(visibleToA).toHaveLength(1);

    const visibleToB = await withTenant(db, tenantBId, (tx) =>
      tx
        .select()
        .from(sites)
        .where(sql`${sites.tenantId} = ${tenantAId}`),
    );
    expect(visibleToB).toHaveLength(0);
  });
});
