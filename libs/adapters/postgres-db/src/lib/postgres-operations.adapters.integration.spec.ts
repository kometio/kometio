import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import { createIntegrationTenant } from './integration-test-fixtures';
import {
  PostgresDatabaseHealth,
  PostgresExpiredRecords,
  PostgresTenantDirectory,
} from './postgres-operations.adapters';

/** Runs against a real Postgres, like the rest of this package's integration specs. */
describe('Postgres operations adapters (integration)', () => {
  let db: KometioDb;

  beforeAll(() => {
    db = createAppDb();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('answers a health ping when the database is there', async () => {
    await expect(
      new PostgresDatabaseHealth(db).ping(),
    ).resolves.toBeUndefined();
  });

  it('lists the tenants, no more than it is asked for', async () => {
    const tenantId = process.env['DEFAULT_TENANT_ID'];
    const directory = new PostgresTenantDirectory(db);

    const ids = await directory.listIds(2);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(ids).toContain(tenantId);
    expect(await directory.listIds(1)).toHaveLength(1);
  });

  it("runs the clean-ups on a tenant's own rows only, and finds nothing to remove in a new one", async () => {
    // A throwaway tenant: the rules themselves are tested where they live
    // (expired-tokens-cleanup, form-submissions-retention-cleanup), and this
    // must never touch the development tenant's data.
    const tenantId = await createIntegrationTenant(db);
    try {
      const expired = new PostgresExpiredRecords(db);

      expect(await expired.deleteExpiredTokens(tenantId)).toEqual({
        deletedSessions: 0,
        deletedVerificationTokens: 0,
      });
      expect(await expired.deleteExpiredFormSubmissions(tenantId)).toEqual({
        deletedSubmissions: 0,
      });
    } finally {
      await deleteIntegrationTenants(db, [tenantId]);
    }
  });
});
