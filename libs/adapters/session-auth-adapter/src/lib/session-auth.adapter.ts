import { hash, verify } from '@node-rs/argon2';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { generateOpaqueToken, hashOpaqueToken } from '@kometio/opaque-token';
import type {
  ActiveSession,
  AuthPort,
  Session,
  SessionDevice,
} from '@kometio/ports';
import { type KometioDb, sessions, withTenant } from '@kometio/postgres-db';

// Exported so apps/api can size the session cookie's maxAge to match —
// the cookie is only ever a client-side hint (the server always re-validates
// against `sessions.expires_at`), but there's no reason to let it drift.
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_RENEWAL_THRESHOLD_MS = SESSION_DURATION_MS / 2;
// A request notes that the session was used only when the last note is older
// than this: being signed in must not be a write per request, and "active 3
// minutes ago" is as much as the list of devices says.
const LAST_USED_GRANULARITY_MS = 5 * 60 * 1000;

function toSession(row: typeof sessions.$inferSelect, token: string): Session {
  return {
    token,
    userId: row.userId,
    tenantId: row.tenantId,
    expiresAt: row.expiresAt,
  };
}

/**
 * Roll-your-own session auth (Lucia Auth was deprecated in March 2025 — see
 * docs/adr/0010-session-based-auth-foundations.md). Connects as `kometio_app`
 * — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
 *
 * `resolveBootstrapTenantId` exists only because
 * `validateSession`/`invalidateSession` look a session up by its (globally
 * unique) token hash *before* the tenant is known — RLS needs `app.current_tenant_id` set for any row to be
 * visible at all, even one matched by a globally-unique key. Safe under the
 * current single-tenant-per-deployment MVP model (every session row already
 * belongs to this one tenant); see the ADR for what changes if Kometio ever
 * becomes genuinely multi-tenant.
 *
 * It is a function rather than a plain id because a self-hosted deployment
 * may not know its tenant when this adapter is constructed: the first-run
 * wizard creates it. Resolving per call, rather than at construction, is
 * what lets the same process serve the wizard and then serve sessions
 * without a restart. See apps/api's DeploymentTenantResolver.
 */
export class SessionAuthAdapter implements AuthPort {
  constructor(
    private readonly db: KometioDb,
    private readonly resolveBootstrapTenantId: () => Promise<string>,
  ) {}

  async hashPassword(plainText: string): Promise<string> {
    return hash(plainText);
  }

  async verifyPassword(
    plainText: string,
    passwordHash: string,
  ): Promise<boolean> {
    return verify(passwordHash, plainText);
  }

  async createSession(
    userId: string,
    tenantId: string,
    device?: SessionDevice,
  ): Promise<Session> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await withTenant(this.db, tenantId, (tx) =>
      tx.insert(sessions).values({
        tenantId,
        userId,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        deviceLabel: device?.label ?? null,
      }),
    );

    return { token, userId, tenantId, expiresAt };
  }

  async validateSession(token: string): Promise<Session | null> {
    const tokenHash = hashOpaqueToken(token);

    const rows = await withTenant(
      this.db,
      await this.resolveBootstrapTenantId(),
      (tx) =>
        tx
          .select()
          .from(sessions)
          .where(eq(sessions.tokenHash, tokenHash))
          .limit(1),
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    const now = Date.now();
    if (row.expiresAt.getTime() <= now) {
      await withTenant(this.db, row.tenantId, (tx) =>
        tx.delete(sessions).where(eq(sessions.id, row.id)),
      );
      return null;
    }

    // One write for both: a session that is renewed is also noted as used.
    const renewed =
      row.expiresAt.getTime() - now < SESSION_RENEWAL_THRESHOLD_MS;
    const noted = now - row.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS;
    if (renewed || noted) {
      const expiresAt = renewed
        ? new Date(now + SESSION_DURATION_MS)
        : row.expiresAt;
      await withTenant(this.db, row.tenantId, (tx) =>
        tx
          .update(sessions)
          .set({ expiresAt, lastUsedAt: new Date(now) })
          .where(eq(sessions.id, row.id)),
      );
      return toSession({ ...row, expiresAt }, token);
    }

    return toSession(row, token);
  }

  async invalidateSession(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    await withTenant(this.db, await this.resolveBootstrapTenantId(), (tx) =>
      tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash)),
    );
  }

  async invalidateAllSessionsForUser(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx.delete(sessions).where(eq(sessions.userId, userId)),
    );
  }

  async listSessionsForUser(
    userId: string,
    tenantId: string,
    currentToken: string,
  ): Promise<ActiveSession[]> {
    const currentHash = hashOpaqueToken(currentToken);
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())),
        )
        .orderBy(desc(sessions.lastUsedAt)),
    );
    return rows.map((row) => ({
      id: row.id,
      deviceLabel: row.deviceLabel,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      isCurrent: row.tokenHash === currentHash,
    }));
  }

  async invalidateSessionOfUser(
    userId: string,
    tenantId: string,
    sessionId: string,
  ): Promise<boolean> {
    const ended = await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .returning({ id: sessions.id }),
    );
    return ended.length > 0;
  }

  async invalidateOtherSessionsForUser(
    userId: string,
    tenantId: string,
    keepToken: string,
  ): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            ne(sessions.tokenHash, hashOpaqueToken(keepToken)),
          ),
        ),
    );
  }
}
