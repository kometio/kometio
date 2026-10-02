import { lt } from 'drizzle-orm';
import { type KometioDb, withTenant } from './client';
import { sessions, verificationTokens } from './schema';

export interface ExpiredTokensCleanupResult {
  deletedSessions: number;
  deletedVerificationTokens: number;
}

/**
 * Security review 2026-08-24, database section: `sessions`/
 * `verification_tokens` declare `expires_at` but nothing ever enforced it
 * at the row level — both self-clean partially on their own read path (see
 * session-auth.adapter.ts/verification-token.adapter.ts), but a session
 * whose cookie is simply abandoned, or an invite/reset link never clicked,
 * left an orphan row forever. Lives here, not in apps/api, so the caller
 * (a scheduled NestJS job) never needs to import drizzle-orm directly —
 * same layering every other Postgres access in this codebase already
 * follows.
 */
export async function deleteExpiredTokens(
  db: KometioDb,
  tenantId: string,
): Promise<ExpiredTokensCleanupResult> {
  const now = new Date();
  const [deletedSessionRows, deletedVerificationTokenRows] = await withTenant(
    db,
    tenantId,
    async (tx) => {
      const sessionRows = await tx
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ id: sessions.id });
      const verificationTokenRows = await tx
        .delete(verificationTokens)
        .where(lt(verificationTokens.expiresAt, now))
        .returning({ id: verificationTokens.id });
      return [sessionRows, verificationTokenRows];
    },
  );

  return {
    deletedSessions: deletedSessionRows.length,
    deletedVerificationTokens: deletedVerificationTokenRows.length,
  };
}
