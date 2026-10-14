import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User } from '@kometio/domain-core';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSecondFactorRepository } from './drizzle-second-factor.repository';
import { DrizzleUserRepository } from './drizzle-user.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, so this is also the RLS regression test for the two tables.
 */
describe('DrizzleSecondFactorRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleSecondFactorRepository;
  let users: DrizzleUserRepository;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleSecondFactorRepository(db);
    users = new DrizzleUserRepository(db);
    tenantAId = await createIntegrationTenant(db, 'Second factor tenant A');
    tenantBId = await createIntegrationTenant(db, 'Second factor tenant B');
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  async function person(tenantId = tenantAId): Promise<string> {
    const user = User.create({
      id: randomUUID(),
      tenantId,
      email: `person-${randomUUID()}@example.com`,
      displayName: 'Person',
      passwordHash: 'irrelevant-for-this-suite',
      role: 'admin',
    });
    await users.add(user);
    return user.id;
  }

  const hashes = (n: number) =>
    Array.from({ length: n }, () => `hash-${randomUUID()}`);

  it('has nothing for a person who never began', async () => {
    const userId = await person();

    expect(await repository.findTotp(tenantAId, userId)).toBeNull();
    expect(await repository.countUnspentRecoveryCodes(tenantAId, userId)).toBe(
      0,
    );
  });

  it('keeps a pending factor apart from a switched-on one', async () => {
    const userId = await person();

    await repository.savePendingTotp(tenantAId, userId, 'sealed-1');

    const pending = await repository.findTotp(tenantAId, userId);
    expect(pending).toMatchObject({
      sealedSecret: 'sealed-1',
      confirmedAt: null,
      lastUsedStep: null,
    });
    expect(await repository.whichHaveSecondFactor(tenantAId, [userId])).toEqual(
      new Set(),
    );
  });

  it('starting again replaces a pending factor, and switching on needs one', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed-1');
    await repository.savePendingTotp(tenantAId, userId, 'sealed-2');

    expect((await repository.findTotp(tenantAId, userId))?.sealedSecret).toBe(
      'sealed-2',
    );
    expect(
      await repository.confirmTotp(tenantAId, userId, 100, hashes(3)),
    ).toBe(true);
    // Nothing pending is left: a second confirmation has nothing to confirm.
    expect(
      await repository.confirmTotp(tenantAId, userId, 101, hashes(3)),
    ).toBe(false);
  });

  it('confirming records the step and the codes in one go', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');

    await repository.confirmTotp(tenantAId, userId, 4242, hashes(10));

    const factor = await repository.findTotp(tenantAId, userId);
    expect(factor?.confirmedAt).toBeInstanceOf(Date);
    expect(factor?.lastUsedStep).toBe(4242);
    expect(await repository.countUnspentRecoveryCodes(tenantAId, userId)).toBe(
      10,
    );
    expect(await repository.whichHaveSecondFactor(tenantAId, [userId])).toEqual(
      new Set([userId]),
    );
  });

  it('starting again on a switched-on factor leaves it off until it is confirmed', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 1, hashes(2));

    await repository.savePendingTotp(tenantAId, userId, 'sealed-new');

    expect((await repository.findTotp(tenantAId, userId))?.confirmedAt).toBe(
      null,
    );
  });

  it('accepts a step once, and only ever forward', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 10, hashes(1));

    expect(await repository.useStep(tenantAId, userId, 11)).toBe(true);
    expect(await repository.useStep(tenantAId, userId, 11)).toBe(false);
    expect(await repository.useStep(tenantAId, userId, 10)).toBe(false);
    expect((await repository.findTotp(tenantAId, userId))?.lastUsedStep).toBe(
      11,
    );
  });

  it('two requests with the same step: one has it', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 10, hashes(1));

    const answers = await Promise.all([
      repository.useStep(tenantAId, userId, 50),
      repository.useStep(tenantAId, userId, 50),
      repository.useStep(tenantAId, userId, 50),
    ]);

    expect(answers.filter(Boolean)).toHaveLength(1);
  });

  describe('the tries of the app’s codes', () => {
    const policy = { maxAttempts: 3, lockMs: 10 * 60 * 1000 };
    const NOW = new Date('2026-10-14T12:00:00Z');

    async function enrolled() {
      const userId = await person();
      await repository.savePendingTotp(tenantAId, userId, 'sealed');
      await repository.confirmTotp(tenantAId, userId, 1, hashes(1));
      return userId;
    }
    const take = (userId: string, at = NOW) =>
      repository.reserveAttempt(tenantAId, userId, at, policy);

    it('gives the tries up to the limit, and holds the codes back after the last', async () => {
      const userId = await enrolled();

      expect(await take(userId)).toBe(true);
      expect(await take(userId)).toBe(true);
      // The last one is given, and it is the one that locks the ones after it.
      expect(await take(userId)).toBe(true);
      expect(await take(userId)).toBe(false);
      expect(await take(userId)).toBe(false);
    });

    it('holds back for as long as the policy says, and counts again from one after', async () => {
      const userId = await enrolled();
      for (let i = 0; i < policy.maxAttempts; i += 1) await take(userId);
      const justBefore = new Date(NOW.getTime() + policy.lockMs - 1000);
      const after = new Date(NOW.getTime() + policy.lockMs + 1000);

      expect(await take(userId, justBefore)).toBe(false);
      expect(await take(userId, after)).toBe(true);
      expect(await take(userId, after)).toBe(true);
      expect(await take(userId, after)).toBe(true);
      expect(await take(userId, after)).toBe(false);
    });

    it('is forgotten when a code is accepted', async () => {
      const userId = await enrolled();
      for (let i = 0; i < policy.maxAttempts; i += 1) await take(userId);
      expect(await take(userId)).toBe(false);

      expect(await repository.useStep(tenantAId, userId, 50)).toBe(true);

      expect(await take(userId)).toBe(true);
    });

    it('is forgotten on request, which is what a recovery code asks', async () => {
      const userId = await enrolled();
      for (let i = 0; i < policy.maxAttempts; i += 1) await take(userId);

      await repository.clearFailedAttempts(tenantAId, userId);

      expect(await take(userId)).toBe(true);
      expect(await take(userId)).toBe(true);
      expect(await take(userId)).toBe(true);
      expect(await take(userId)).toBe(false);
    });

    it('gives the limit and no more to a hundred requests at once', async () => {
      const userId = await enrolled();

      const answers = await Promise.all(
        Array.from({ length: 100 }, () => take(userId)),
      );

      expect(answers.filter(Boolean)).toHaveLength(policy.maxAttempts);
    });

    it('gives nothing for a person who has not switched it on', async () => {
      const userId = await person();
      await repository.savePendingTotp(tenantAId, userId, 'sealed');

      expect(await take(userId)).toBe(false);
    });

    it('is theirs alone: another tenant’s request is told no and moves nothing', async () => {
      const userId = await enrolled();

      expect(
        await repository.reserveAttempt(tenantBId, userId, NOW, policy),
      ).toBe(false);
      expect(await take(userId)).toBe(true);
    });
  });

  it('spends a recovery code once, whoever asks first', async () => {
    const userId = await person();
    const codes = hashes(3);
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 1, codes);

    const answers = await Promise.all([
      repository.spendRecoveryCode(tenantAId, userId, codes[0] ?? ''),
      repository.spendRecoveryCode(tenantAId, userId, codes[0] ?? ''),
    ]);

    expect(answers.filter(Boolean)).toHaveLength(1);
    expect(await repository.countUnspentRecoveryCodes(tenantAId, userId)).toBe(
      2,
    );
    expect(
      await repository.spendRecoveryCode(tenantAId, userId, 'never-issued'),
    ).toBe(false);
  });

  it('replaces the codes: the old ones stop working', async () => {
    const userId = await person();
    const first = hashes(2);
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 1, first);

    const second = hashes(4);
    await repository.replaceRecoveryCodes(tenantAId, userId, second);

    expect(
      await repository.spendRecoveryCode(tenantAId, userId, first[0] ?? ''),
    ).toBe(false);
    expect(
      await repository.spendRecoveryCode(tenantAId, userId, second[0] ?? ''),
    ).toBe(true);
    expect(await repository.countUnspentRecoveryCodes(tenantAId, userId)).toBe(
      3,
    );
  });

  it('removing takes the factor and the codes, and says whether there were any', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 1, hashes(5));

    expect(await repository.removeAll(tenantAId, userId)).toBe(true);
    expect(await repository.findTotp(tenantAId, userId)).toBeNull();
    expect(await repository.countUnspentRecoveryCodes(tenantAId, userId)).toBe(
      0,
    );
    expect(await repository.removeAll(tenantAId, userId)).toBe(false);
  });

  it('is invisible from another tenant', async () => {
    const userId = await person();
    await repository.savePendingTotp(tenantAId, userId, 'sealed');
    await repository.confirmTotp(tenantAId, userId, 1, hashes(2));

    expect(await repository.findTotp(tenantBId, userId)).toBeNull();
    expect(await repository.whichHaveSecondFactor(tenantBId, [userId])).toEqual(
      new Set(),
    );
    expect(await repository.useStep(tenantBId, userId, 99)).toBe(false);
    expect(await repository.removeAll(tenantBId, userId)).toBe(false);
    expect(
      (await repository.findTotp(tenantAId, userId))?.confirmedAt,
    ).not.toBe(null);
  });
});
