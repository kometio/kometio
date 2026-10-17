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
    const directory = new PostgresTenantDirectory(db);
    // Which tenants a limited listing returns is the database's to choose (the
    // port promises how many, not which), and the other suites of a run make
    // and drop tenants of their own while this one reads: so the limit is
    // tested against tenants this test made, enough of them to be over it, and
    // the development tenant is looked for in a listing that has room for it.
    const made = [
      await createIntegrationTenant(db),
      await createIntegrationTenant(db),
    ];
    try {
      expect(await directory.listIds(1)).toHaveLength(1);
      expect(await directory.listIds(2)).toHaveLength(2);
      expect(await directory.listIds(1_000)).toContain(
        process.env['DEFAULT_TENANT_ID'],
      );
    } finally {
      await deleteIntegrationTenants(db, made);
    }
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
