import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  auditEvents,
  createAppDb,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationTenant,
  createIntegrationUser,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleAuditLogRepository } from './drizzle-audit-log.repository';

/** Runs against a real Postgres — see docs/development.md. */
describe('DrizzleAuditLogRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleAuditLogRepository;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db);
    otherTenantId = await createIntegrationTenant(db);
    repository = new DrizzleAuditLogRepository(db);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId, otherTenantId]);
    await db.$client.end();
  });

  it('keeps who did what to what, and says who by their account as it is now', async () => {
    const actor = await createIntegrationUser(db, tenantId, {
      email: `actor-${Date.now()}@example.test`,
    });

    await repository.record({
      tenantId,
      actorUserId: actor,
      action: 'user.role_changed',
      targetId: 'target-1',
      targetLabel: 'colleague@example.test',
      detail: { role: 'publisher' },
    });

    const { items } = await repository.list(tenantId, {
      page: 1,
      pageSize: 50,
    });
    const entry = items.find((item) => item.targetId === 'target-1');
    expect(entry).toMatchObject({
      action: 'user.role_changed',
      actorUserId: actor,
      targetLabel: 'colleague@example.test',
      detail: { role: 'publisher' },
    });
    expect(entry?.actorEmail).toMatch(/^actor-\d+@example\.test$/);
  });

  it('lists the newest first, in pages, with the total', async () => {
    const paged = await createIntegrationTenant(db);
    try {
      for (const label of ['first', 'second', 'third']) {
        await repository.record({
          tenantId: paged,
          actorUserId: null,
          action: 'site.settings_changed',
          targetLabel: label,
        });
      }

      const firstPage = await repository.list(paged, { page: 1, pageSize: 2 });
      const secondPage = await repository.list(paged, { page: 2, pageSize: 2 });

      expect(firstPage.total).toBe(3);
      expect(firstPage.items.map((item) => item.targetLabel)).toEqual([
        'third',
        'second',
      ]);
      expect(secondPage.items.map((item) => item.targetLabel)).toEqual([
        'first',
      ]);
    } finally {
      await deleteIntegrationTenants(db, [paged]);
    }
  });

  it('keeps an entry whose actor is gone, with no actor', async () => {
    const gone = await createIntegrationTenant(db);
    try {
      const actor = await createIntegrationUser(db, gone);
      await repository.record({
        tenantId: gone,
        actorUserId: actor,
        action: 'user.invited',
        targetLabel: 'someone@example.test',
      });
      await withTenant(db, gone, (tx) =>
        tx.execute(sql`delete from users where id = ${actor}`),
      );

      const { items } = await repository.list(gone, { page: 1, pageSize: 10 });

      expect(items).toHaveLength(1);
      expect(items[0].actorUserId).toBeNull();
      expect(items[0].actorEmail).toBeNull();
    } finally {
      await deleteIntegrationTenants(db, [gone]);
    }
  });

  it('shows one site nothing of another', async () => {
    await repository.record({
      tenantId: otherTenantId,
      actorUserId: null,
      action: 'archive.exported',
      targetLabel: 'only-in-the-other',
    });

    const { items } = await repository.list(tenantId, {
      page: 1,
      pageSize: 100,
    });

    expect(items.some((item) => item.targetLabel === 'only-in-the-other')).toBe(
      false,
    );
  });

  it('cannot be edited by the application: an entry is a statement of what happened', async () => {
    await repository.record({
      tenantId,
      actorUserId: null,
      action: 'login.failed',
      targetLabel: 'immutable',
    });

    await expect(
      withTenant(db, tenantId, (tx) =>
        tx
          .update(auditEvents)
          .set({ action: 'login.succeeded' })
          .where(eq(auditEvents.targetLabel, 'immutable')),
      ),
    ).rejects.toThrow();
  });
});
