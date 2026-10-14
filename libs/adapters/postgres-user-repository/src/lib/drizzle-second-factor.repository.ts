import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { SecondFactorRepositoryPort, TotpFactor } from '@kometio/ports';
import {
  type KometioDb,
  type KometioTx,
  userRecoveryCodes,
  userSecondFactors,
  withTenant,
} from '@kometio/postgres-db';

const TOTP = 'totp';

function toFactor(row: typeof userSecondFactors.$inferSelect): TotpFactor {
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    sealedSecret: row.sealedSecret,
    confirmedAt: row.confirmedAt,
    lastUsedStep: row.lastUsedStep,
  };
}

function insertCodes(
  tx: KometioTx,
  tenantId: string,
  userId: string,
  codeHashes: string[],
) {
  if (codeHashes.length === 0) return Promise.resolve();
  return tx
    .insert(userRecoveryCodes)
    .values(codeHashes.map((codeHash) => ({ tenantId, userId, codeHash })))
    .then(() => undefined);
}

/**
 * Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
 *
 * What has to be one step is one statement: a step is accepted and recorded
 * in the same `UPDATE … WHERE last_used_step < $step`, and a recovery code is
 * spent in the same `UPDATE … WHERE spent_at IS NULL`. Reading first and
 * writing after would let two requests with the same code both pass.
 */
export class DrizzleSecondFactorRepository implements SecondFactorRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async findTotp(tenantId: string, userId: string): Promise<TotpFactor | null> {
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(userSecondFactors)
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            eq(userSecondFactors.userId, userId),
            eq(userSecondFactors.kind, TOTP),
          ),
        )
        .limit(1),
    );
    return row ? toFactor(row) : null;
  }

  async whichHaveSecondFactor(
    tenantId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ userId: userSecondFactors.userId })
        .from(userSecondFactors)
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            inArray(userSecondFactors.userId, userIds),
            eq(userSecondFactors.kind, TOTP),
            isNotNull(userSecondFactors.confirmedAt),
          ),
        ),
    );
    return new Set(rows.map((row) => row.userId));
  }

  async savePendingTotp(
    tenantId: string,
    userId: string,
    sealedSecret: string,
  ): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      // The codes of a factor that was switched on go with it: what is
      // pending is not asked at sign-in, and what replaces it makes its own.
      await tx
        .delete(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
          ),
        );
      await tx
        .insert(userSecondFactors)
        .values({ tenantId, userId, kind: TOTP, sealedSecret })
        .onConflictDoUpdate({
          target: [userSecondFactors.userId, userSecondFactors.kind],
          set: {
            sealedSecret,
            confirmedAt: null,
            lastUsedStep: null,
            failedAttempts: 0,
            lockedUntil: null,
            createdAt: new Date(),
          },
        });
    });
  }

  async confirmTotp(
    tenantId: string,
    userId: string,
    firstStep: number,
    recoveryCodeHashes: string[],
  ): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => {
      const confirmed = await tx
        .update(userSecondFactors)
        .set({ confirmedAt: new Date(), lastUsedStep: firstStep })
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            eq(userSecondFactors.userId, userId),
            eq(userSecondFactors.kind, TOTP),
            isNull(userSecondFactors.confirmedAt),
          ),
        )
        .returning({ id: userSecondFactors.id });
      if (confirmed.length === 0) return false;

      await tx
        .delete(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
          ),
        );
      await insertCodes(tx, tenantId, userId, recoveryCodeHashes);
      return true;
    });
  }

  async useStep(
    tenantId: string,
    userId: string,
    step: number,
  ): Promise<boolean> {
    const moved = await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(userSecondFactors)
        .set({ lastUsedStep: step, failedAttempts: 0, lockedUntil: null })
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            eq(userSecondFactors.userId, userId),
            eq(userSecondFactors.kind, TOTP),
            isNotNull(userSecondFactors.confirmedAt),
            or(
              isNull(userSecondFactors.lastUsedStep),
              lt(userSecondFactors.lastUsedStep, step),
            ),
          ),
        )
        .returning({ id: userSecondFactors.id }),
    );
    return moved.length > 0;
  }

  async reserveAttempt(
    tenantId: string,
    userId: string,
    now: Date,
    policy: { maxAttempts: number; lockMs: number },
  ): Promise<boolean> {
    const at = now.toISOString();
    const lockUntil = new Date(now.getTime() + policy.lockMs).toISOString();
    // One statement, over the row as it is the moment it is locked. `old` is
    // read FOR UPDATE, so a second request waits for the first and then reads
    // what it left; the new count and the lock are worked out from that same
    // row. Held back (a lock still on): nothing moves. Otherwise the count
    // goes up by one, or starts at one when a lock has just run out, and the
    // try that reaches the limit is given and locks the ones after it.
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.execute<{ allowed: boolean }>(sql`
        update user_second_factors as f
        set failed_attempts = case
              when o.locked_until is not null and o.locked_until > ${at}::timestamptz
                then f.failed_attempts
              when o.locked_until is not null then 1
              else f.failed_attempts + 1
            end,
            locked_until = case
              when o.locked_until is not null and o.locked_until > ${at}::timestamptz
                then o.locked_until
              when (case when o.locked_until is not null then 1 else f.failed_attempts + 1 end) >= ${policy.maxAttempts}
                then ${lockUntil}::timestamptz
              else null
            end
        from (
          select id, locked_until
          from user_second_factors
          where tenant_id = ${tenantId}
            and user_id = ${userId}
            and kind = ${TOTP}
            and confirmed_at is not null
          for update
        ) as o
        where f.id = o.id
        returning (o.locked_until is null or o.locked_until <= ${at}::timestamptz) as allowed
      `),
    );
    return rows[0]?.allowed === true;
  }

  async clearFailedAttempts(tenantId: string, userId: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(userSecondFactors)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            eq(userSecondFactors.userId, userId),
            eq(userSecondFactors.kind, TOTP),
          ),
        ),
    );
  }

  async spendRecoveryCode(
    tenantId: string,
    userId: string,
    codeHash: string,
  ): Promise<boolean> {
    const spent = await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(userRecoveryCodes)
        .set({ spentAt: new Date() })
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
            eq(userRecoveryCodes.codeHash, codeHash),
            isNull(userRecoveryCodes.spentAt),
          ),
        )
        .returning({ id: userRecoveryCodes.id }),
    );
    return spent.length > 0;
  }

  async countUnspentRecoveryCodes(
    tenantId: string,
    userId: string,
  ): Promise<number> {
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ unspent: count() })
        .from(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
            isNull(userRecoveryCodes.spentAt),
          ),
        ),
    );
    return row?.unspent ?? 0;
  }

  async replaceRecoveryCodes(
    tenantId: string,
    userId: string,
    codeHashes: string[],
  ): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      await tx
        .delete(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
          ),
        );
      await insertCodes(tx, tenantId, userId, codeHashes);
    });
  }

  async removeAll(tenantId: string, userId: string): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => {
      const factors = await tx
        .delete(userSecondFactors)
        .where(
          and(
            eq(userSecondFactors.tenantId, tenantId),
            eq(userSecondFactors.userId, userId),
          ),
        )
        .returning({ id: userSecondFactors.id });
      const codes = await tx
        .delete(userRecoveryCodes)
        .where(
          and(
            eq(userRecoveryCodes.tenantId, tenantId),
            eq(userRecoveryCodes.userId, userId),
          ),
        )
        .returning({ id: userRecoveryCodes.id });
      return factors.length > 0 || codes.length > 0;
    });
  }
}
