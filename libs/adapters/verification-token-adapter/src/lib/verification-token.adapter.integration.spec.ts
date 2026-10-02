import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  createAppDb,
  verificationTokens,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationTenant,
  createIntegrationUser,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { VerificationTokenAdapter } from './verification-token.adapter';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, so this also regression-tests RLS isolation for
 * `verification_tokens` (see drizzle/0000_baseline_schema.sql).
 */
describe('VerificationTokenAdapter (integration)', () => {
  let db: KometioDb;
  let adapter: VerificationTokenAdapter;
  let tenantId: string;

  beforeAll(async () => {
    db = createAppDb();

    tenantId = await createIntegrationTenant(db);
    adapter = new VerificationTokenAdapter(db, async () => tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantId]);
    await db.$client.end();
  });

  it('creates a token that consumes back to the same user/tenant/purpose', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createToken(
      userId,
      tenantId,
      'email-verification',
      1000 * 60 * 60,
    );

    const consumed = await adapter.consumeToken(
      created.token,
      'email-verification',
    );

    expect(consumed?.userId).toBe(userId);
    expect(consumed?.tenantId).toBe(tenantId);
    expect(consumed?.purpose).toBe('email-verification');
  });

  it('carries what it was issued for, and nothing when it was issued for nothing', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const withPayload = await adapter.createToken(
      userId,
      tenantId,
      'email-change',
      1000 * 60,
      'new@example.com',
    );
    const without = await adapter.createToken(
      userId,
      tenantId,
      'password-reset',
      1000 * 60,
    );

    expect(withPayload.payload).toBe('new@example.com');
    expect(
      (await adapter.consumeToken(withPayload.token, 'email-change'))?.payload,
    ).toBe('new@example.com');
    expect(
      (await adapter.consumeToken(without.token, 'password-reset'))?.payload,
    ).toBeNull();
  });

  it('never persists the plaintext token — only its hash is in the DB', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createToken(
      userId,
      tenantId,
      'password-reset',
      1000 * 60,
    );

    const [row] = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.userId, userId))
        .limit(1),
    );

    expect(row.tokenHash).not.toBe(created.token);
  });

  it('is single-use: a second consume of the same token fails', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createToken(
      userId,
      tenantId,
      'password-reset',
      1000 * 60,
    );

    const first = await adapter.consumeToken(created.token, 'password-reset');
    const second = await adapter.consumeToken(created.token, 'password-reset');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('rejects a token consumed with the wrong purpose', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createToken(
      userId,
      tenantId,
      'password-reset',
      1000 * 60,
    );

    expect(
      await adapter.consumeToken(created.token, 'email-verification'),
    ).toBeNull();
  });

  it('rejects an unknown token', async () => {
    expect(
      await adapter.consumeToken('not-a-real-token', 'password-reset'),
    ).toBeNull();
  });

  it('rejects an expired token', async () => {
    const userId = await createIntegrationUser(db, tenantId);
    const created = await adapter.createToken(
      userId,
      tenantId,
      'password-reset',
      1000 * 60,
    );
    await withTenant(db, tenantId, (tx) =>
      tx
        .update(verificationTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(verificationTokens.userId, userId)),
    );

    expect(
      await adapter.consumeToken(created.token, 'password-reset'),
    ).toBeNull();
  });
});
