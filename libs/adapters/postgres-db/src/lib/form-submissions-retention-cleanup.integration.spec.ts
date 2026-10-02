import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteExpiredFormSubmissions } from './form-submissions-retention-cleanup';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationSite,
  createIntegrationTenant,
} from './integration-test-fixtures';
import { formSubmissions } from './schema';

/**
 * Runs against a real Postgres — see docs/development.md. Own throwaway
 * tenant (sites/form_submissions cascade, see schema.ts), cleaned up via
 * deleteIntegrationTenants.
 */
describe('deleteExpiredFormSubmissions (integration)', () => {
  let db: KometioDb;
  let tenantId: string;

  beforeAll(async () => {
    db = createAppDb();

    tenantId = await createIntegrationTenant(db);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId]);
    await db.$client.end();
  });

  async function insertSite(retentionDays: number | null) {
    return createIntegrationSite(db, tenantId, {
      formSubmissionRetentionDays: retentionDays,
    });
  }

  async function insertSubmission(siteId: string, createdAt: Date) {
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(formSubmissions)
        .values({ tenantId, siteId, payload: {}, createdAt })
        .returning({ id: formSubmissions.id }),
    );
    return row.id;
  }

  it("deletes only submissions older than their own site's retention window", async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
    const recentDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

    const siteWithShortRetention = await insertSite(7); // keeps only 7 days
    const siteWithLongRetention = await insertSite(30); // keeps 30 days
    const siteWithNoRetention = await insertSite(null); // keeps forever

    const expired = await insertSubmission(siteWithShortRetention, oldDate);
    const stillWithinShortWindow = await insertSubmission(
      siteWithShortRetention,
      recentDate,
    );
    const withinLongWindow = await insertSubmission(
      siteWithLongRetention,
      oldDate,
    );
    const neverExpires = await insertSubmission(siteWithNoRetention, oldDate);

    const result = await deleteExpiredFormSubmissions(db, tenantId);

    expect(result.deletedSubmissions).toBe(1);

    const remaining = await withTenant(db, tenantId, (tx) =>
      tx
        .select({ id: formSubmissions.id })
        .from(formSubmissions)
        .where(eq(formSubmissions.tenantId, tenantId)),
    );
    const remainingIds = remaining.map((row) => row.id);

    expect(remainingIds).not.toContain(expired);
    expect(remainingIds).toContain(stillWithinShortWindow);
    expect(remainingIds).toContain(withinLongWindow);
    expect(remainingIds).toContain(neverExpires);
  });

  it('is a no-op when no site has a retention policy set', async () => {
    const siteId = await insertSite(null);
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
    await insertSubmission(siteId, oldDate);

    const result = await deleteExpiredFormSubmissions(db, tenantId);

    expect(result.deletedSubmissions).toBe(0);
  });
});
