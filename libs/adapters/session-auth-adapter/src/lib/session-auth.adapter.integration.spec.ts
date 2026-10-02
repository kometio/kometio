import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  createAppDb,
  sessions,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationTenant,
  createIntegrationUser,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { SessionAuthAdapter } from './session-auth.adapter';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this also regression-tests RLS
 * isolation for `sessions` (see drizzle/0000_baseline_schema.sql).
 */
describe('SessionAuthAdapter (integration)', () => {
  let db: KometioDb;
  let adapter: SessionAuthAdapter;
  let tenantId: string;

  beforeAll(async () => {
    db = createAppDb();

    tenantId = await createIntegrationTenant(db);
    adapter = new SessionAuthAdapter(db, async () => tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId]);
    await db.$client.end();
  });

  // Every test creates its own user: sessions for one test's user must
  // never leak into another test's row-count assertions.
  it('creates a session that validates back to the same user/tenant', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createSession(userId, tenantId);

    const validated = await adapter.validateSession(created.token);

    expect(validated?.userId).toBe(userId);
    expect(validated?.tenantId).toBe(tenantId);
  });

  it('never persists the plaintext token — only its hash is in the DB', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createSession(userId, tenantId);

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(sessions).where(eq(sessions.userId, userId)).limit(1),
    );

    expect(row.tokenHash).not.toBe(created.token);
  });

  it('rejects an unknown token', async () => {
    expect(await adapter.validateSession('not-a-real-token')).toBeNull();
  });

  it('invalidateSession makes the token stop validating', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createSession(userId, tenantId);

    await adapter.invalidateSession(created.token);

    expect(await adapter.validateSession(created.token)).toBeNull();
  });

  it('treats an expired session as invalid and deletes it', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createSession(userId, tenantId);
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.userId, userId)),
    );

    expect(await adapter.validateSession(created.token)).toBeNull();

    const remaining = await withTenant(db, tenantId, (tx) =>
      tx.select().from(sessions).where(eq(sessions.userId, userId)),
    );
    expect(remaining).toHaveLength(0);
  });

  it('invalidateAllSessionsForUser removes every session for that user, but not others', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const otherUserId = await createIntegrationUser(db, tenantId);
    const created1 = await adapter.createSession(userId, tenantId);
    const created2 = await adapter.createSession(userId, tenantId);
    const otherCreated = await adapter.createSession(otherUserId, tenantId);

    await adapter.invalidateAllSessionsForUser(userId, tenantId);

    expect(await adapter.validateSession(created1.token)).toBeNull();
    expect(await adapter.validateSession(created2.token)).toBeNull();
    expect(await adapter.validateSession(otherCreated.token)).not.toBeNull();
  });

  it('invalidateOtherSessionsForUser ends the other sessions of that user, keeps the named one, and leaves other users alone', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const otherUserId = await createIntegrationUser(db, tenantId);
    const here = await adapter.createSession(userId, tenantId);
    const elsewhere = await adapter.createSession(userId, tenantId);
    const another = await adapter.createSession(userId, tenantId);
    const otherUsers = await adapter.createSession(otherUserId, tenantId);

    await adapter.invalidateOtherSessionsForUser(userId, tenantId, here.token);

    expect(await adapter.validateSession(here.token)).not.toBeNull();
    expect(await adapter.validateSession(elsewhere.token)).toBeNull();
    expect(await adapter.validateSession(another.token)).toBeNull();
    expect(await adapter.validateSession(otherUsers.token)).not.toBeNull();
  });

  it('renews a session that is past the halfway point of its lifetime', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createSession(userId, tenantId);
    const almostExpired = new Date(Date.now() + 1000 * 60); // 1 minute left
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(sessions)
        .set({ expiresAt: almostExpired })
        .where(eq(sessions.userId, userId)),
    );

    const validated = await adapter.validateSession(created.token);

    expect(validated?.expiresAt.getTime()).toBeGreaterThan(
      almostExpired.getTime(),
    );
  });
});
