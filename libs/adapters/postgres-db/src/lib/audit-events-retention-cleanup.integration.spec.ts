import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteAuditEventsBefore } from './audit-events-retention-cleanup';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import { createIntegrationTenant } from './integration-test-fixtures';
import { auditEvents } from './schema';

/** Runs against a real Postgres — see docs/development.md. */
describe('deleteAuditEventsBefore (integration)', () => {
  let db: KometioDb;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db);
    otherTenantId = await createIntegrationTenant(db);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId, otherTenantId]);
    await db.$client.end();
  });

  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  async function insertEvent(forTenant: string, at: Date, label: string) {
    await withTenant(db, forTenant, (tx) =>
      tx.insert(auditEvents).values({
        tenantId: forTenant,
        at,
        action: 'login.succeeded',
        targetLabel: label,
      }),
    );
  }

  async function labelsOf(forTenant: string) {
    const rows = await withTenant(db, forTenant, (tx) =>
      tx
        .select({ label: auditEvents.targetLabel })
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, forTenant)),
    );
    return rows.map((row) => row.label).sort();
  }

  it('removes what is older than the cut-off and keeps the rest', async () => {
    await insertEvent(tenantId, daysAgo(100), 'old');
    await insertEvent(tenantId, daysAgo(91), 'just-too-old');
    await insertEvent(tenantId, daysAgo(89), 'recent');
    await insertEvent(tenantId, daysAgo(0), 'today');

    const result = await deleteAuditEventsBefore(db, tenantId, daysAgo(90));

    expect(result.deletedEvents).toBe(2);
    expect(await labelsOf(tenantId)).toEqual(['recent', 'today']);
  });

  it('does not reach another tenant’s log', async () => {
    await insertEvent(otherTenantId, daysAgo(200), 'theirs-and-old');

    await deleteAuditEventsBefore(db, tenantId, daysAgo(90));

    expect(await labelsOf(otherTenantId)).toEqual(['theirs-and-old']);
  });
});
