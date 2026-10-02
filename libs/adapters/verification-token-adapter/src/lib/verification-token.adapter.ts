import { and, eq } from 'drizzle-orm';
import { generateOpaqueToken, hashOpaqueToken } from '@kometio/opaque-token';
import type { VerificationTokenPurpose } from '@kometio/domain-core';
import type { VerificationToken, VerificationTokenPort } from '@kometio/ports';
import {
  type KometioDb,
  verificationTokens,
  withTenant,
} from '@kometio/postgres-db';

function toVerificationToken(
  row: typeof verificationTokens.$inferSelect,
  token: string,
): VerificationToken {
  return {
    token,
    userId: row.userId,
    tenantId: row.tenantId,
    purpose: row.purpose,
    payload: row.payload,
    expiresAt: row.expiresAt,
  };
}

/**
 * Same opaque-token mechanic as SessionAuthAdapter (@kometio/opaque-token),
 * but for one-time tokens — connects as `kometio_app`, see
 * docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
 *
 * `resolveBootstrapTenantId`: same RLS chicken-and-egg as SessionAuthAdapter —
 * `consumeToken` looks a token up by its globally-unique hash before the
 * tenant is known. See docs/adr/0010-session-based-auth-foundations.md.
 *
 * It is a function rather than a plain id because a self-hosted deployment
 * may not know its tenant when this adapter is constructed: the first-run
 * wizard creates it. Resolving per call, rather than at construction, is
 * what lets the same process serve the wizard and then serve sessions
 * without a restart. See apps/api's DeploymentTenantResolver.
 */
export class VerificationTokenAdapter implements VerificationTokenPort {
  constructor(
    private readonly db: KometioDb,
    private readonly resolveBootstrapTenantId: () => Promise<string>,
  ) {}

  async createToken(
    userId: string,
    tenantId: string,
    purpose: VerificationTokenPurpose,
    ttlMs: number,
    payload?: string,
  ): Promise<VerificationToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ttlMs);

    await withTenant(this.db, tenantId, (tx) =>
      tx.insert(verificationTokens).values({
        tenantId,
        userId,
        purpose,
        payload: payload ?? null,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
      }),
    );

    return {
      token,
      userId,
      tenantId,
      purpose,
      payload: payload ?? null,
      expiresAt,
    };
  }

  async consumeToken(
    token: string,
    purpose: VerificationTokenPurpose,
  ): Promise<VerificationToken | null> {
    const tokenHash = hashOpaqueToken(token);

    // DELETE ... RETURNING is atomic: a concurrent second consume of the
    // same token finds nothing to delete, so double-consumption can't
    // race — no explicit row locking needed.
    const rows = await withTenant(
      this.db,
      await this.resolveBootstrapTenantId(),
      (tx) =>
        tx
          .delete(verificationTokens)
          .where(
            and(
              eq(verificationTokens.tokenHash, tokenHash),
              eq(verificationTokens.purpose, purpose),
            ),
          )
          .returning(),
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return toVerificationToken(row, token);
  }
}
