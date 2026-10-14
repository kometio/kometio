import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashOpaqueToken } from '@kometio/opaque-token';
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

  describe('the devices a person is signed in on', () => {
    const lastUsedOf = async (userId: string) => {
      const [row] = await withTenant(db, tenantId, (tx) =>
        tx
          .select({ lastUsedAt: sessions.lastUsedAt })
          .from(sessions)
          .where(eq(sessions.userId, userId))
          .limit(1),
      );
      return row.lastUsedAt;
    };

    it('lists what a sign-in said about its device, and which one is the one asking', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const laptop = await adapter.createSession(userId, tenantId, {
        label: 'Chrome on macOS',
      });
      await adapter.createSession(userId, tenantId, { label: null });

      const listed = await adapter.listSessionsForUser(
        userId,
        tenantId,
        laptop.token,
      );

      expect(listed).toHaveLength(2);
      expect(listed.filter((session) => session.isCurrent)).toHaveLength(1);
      const current = listed.find((session) => session.isCurrent);
      expect(current?.deviceLabel).toBe('Chrome on macOS');
      expect(listed.find((session) => !session.isCurrent)?.deviceLabel).toBe(
        null,
      );
    });

    it('does not hand out anything that is a way in: the id is not the token, nor its hash', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const created = await adapter.createSession(userId, tenantId);

      const [listed] = await adapter.listSessionsForUser(
        userId,
        tenantId,
        created.token,
      );

      expect(JSON.stringify(listed)).not.toContain(created.token);
      const [row] = await withTenant(db, tenantId, (tx) =>
        tx.select().from(sessions).where(eq(sessions.userId, userId)),
      );
      expect(JSON.stringify(listed)).not.toContain(row.tokenHash);
    });

    it('lists only the person’s own, and none that has expired', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const otherUserId = await createIntegrationUser(db, tenantId);
      const here = await adapter.createSession(userId, tenantId);
      const gone = await adapter.createSession(userId, tenantId);
      await adapter.createSession(otherUserId, tenantId);
      await withTenant(db, tenantId, (tx) =>
        tx
          .update(sessions)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(sessions.tokenHash, hashOpaqueToken(gone.token))),
      );

      const listed = await adapter.listSessionsForUser(
        userId,
        tenantId,
        here.token,
      );

      expect(listed).toHaveLength(1);
    });

    it('ends one of them by its id, and only that one', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const here = await adapter.createSession(userId, tenantId);
      const elsewhere = await adapter.createSession(userId, tenantId);
      const listed = await adapter.listSessionsForUser(
        userId,
        tenantId,
        here.token,
      );
      const target = listed.find((session) => !session.isCurrent);

      expect(
        await adapter.invalidateSessionOfUser(
          userId,
          tenantId,
          target?.id ?? '',
        ),
      ).toBe(true);

      expect(await adapter.validateSession(elsewhere.token)).toBeNull();
      expect(await adapter.validateSession(here.token)).not.toBeNull();
    });

    it('will not end another person’s session, whatever id it is given', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const otherUserId = await createIntegrationUser(db, tenantId);
      const theirs = await adapter.createSession(otherUserId, tenantId);
      const [theirRow] = await adapter.listSessionsForUser(
        otherUserId,
        tenantId,
        theirs.token,
      );

      expect(
        await adapter.invalidateSessionOfUser(userId, tenantId, theirRow.id),
      ).toBe(false);

      expect(await adapter.validateSession(theirs.token)).not.toBeNull();
    });

    it('says so when there was nothing to end', async () => {
      const userId = await createIntegrationUser(db, tenantId);

      expect(
        await adapter.invalidateSessionOfUser(userId, tenantId, randomUUID()),
      ).toBe(false);
    });

    it('notes a use that is older than a few minutes, and leaves a recent one alone', async () => {
      const userId = await createIntegrationUser(db, tenantId);
      const created = await adapter.createSession(userId, tenantId);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const underAMinuteAgo = new Date(Date.now() - 30 * 1000);
      const setLastUsed = (at: Date) =>
        withTenant(db, tenantId, (tx) =>
          tx
            .update(sessions)
            .set({ lastUsedAt: at })
            .where(eq(sessions.userId, userId)),
        );

      await setLastUsed(tenMinutesAgo);
      await adapter.validateSession(created.token);
      const afterOld = await lastUsedOf(userId);
      expect(afterOld.getTime()).toBeGreaterThan(
        tenMinutesAgo.getTime() + 60_000,
      );

      await setLastUsed(underAMinuteAgo);
      await adapter.validateSession(created.token);
      expect((await lastUsedOf(userId)).getTime()).toBe(
        underAMinuteAgo.getTime(),
      );
    });
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
