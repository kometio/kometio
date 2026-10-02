import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteExpiredTokens } from './expired-tokens-cleanup';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationTenant,
  createIntegrationUser,
} from './integration-test-fixtures';
import { sessions, verificationTokens } from './schema';

/**
 * Runs against a real Postgres — see docs/development.md. Own throwaway
 * tenant + user (sessions/verification_tokens cascade from both, see
 * schema.ts), cleaned up via deleteIntegrationTenants.
 */
describe('deleteExpiredTokens (integration)', () => {
  let db: KometioDb;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    db = createAppDb();

    tenantId = await createIntegrationTenant(db);

    userId = await createIntegrationUser(db, tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId]);
    await db.$client.end();
  });

  it('deletes expired sessions and verification tokens, keeps the still-valid ones', async () => {
    const past = new Date(Date.now() - 1000 * 60);
    const future = new Date(Date.now() + 1000 * 60 * 60);

    const [expiredSession, validSession] = await withTenant(
      db,
      tenantId,
      (tx) =>
        tx
          .insert(sessions)
          .values([
            {
              tenantId,
              userId,
              tokenHash: `expired-session-${randomUUID()}`,
              expiresAt: past,
            },
            {
              tenantId,
              userId,
              tokenHash: `valid-session-${randomUUID()}`,
              expiresAt: future,
            },
          ])
          .returning({ id: sessions.id }),
    );

    const [expiredToken, validToken] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(verificationTokens)
        .values([
          {
            tenantId,
            userId,
            purpose: 'password-reset',
            tokenHash: `expired-token-${randomUUID()}`,
            expiresAt: past,
          },
          {
            tenantId,
            userId,
            purpose: 'password-reset',
            tokenHash: `valid-token-${randomUUID()}`,
            expiresAt: future,
          },
        ])
        .returning({ id: verificationTokens.id }),
    );

    const result = await deleteExpiredTokens(db, tenantId);

    expect(result.deletedSessions).toBe(1);
    expect(result.deletedVerificationTokens).toBe(1);

    const [remainingSessions, remainingTokens] = await withTenant(
      db,
      tenantId,
      async (tx) => [
        await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.userId, userId)),
        await tx
          .select({ id: verificationTokens.id })
          .from(verificationTokens)
          .where(eq(verificationTokens.userId, userId)),
      ],
    );

    expect(remainingSessions.map((row) => row.id)).toEqual([validSession.id]);
    expect(remainingSessions.map((row) => row.id)).not.toContain(
      expiredSession.id,
    );
    expect(remainingTokens.map((row) => row.id)).toEqual([validToken.id]);
    expect(remainingTokens.map((row) => row.id)).not.toContain(expiredToken.id);
  });
});
