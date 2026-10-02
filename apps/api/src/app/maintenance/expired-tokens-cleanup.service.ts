import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ExpiredRecordsPort } from '@kometio/ports';

/**
 * Single tenant assumed (docs/adr/0010, same as `bootstrapTenantId` on
 * SessionAuthAdapter/VerificationTokenAdapter) — a genuinely multi-tenant
 * deployment would need to iterate every tenant here instead. See
 * ExpiredRecordsPort's own doc comment for why sessions/verification_tokens
 * need this at all.
 */
@Injectable()
export class ExpiredTokensCleanupService {
  private readonly logger = new Logger(ExpiredTokensCleanupService.name);

  constructor(
    private readonly expiredRecords: ExpiredRecordsPort,
    /**
     * A function, not an id: a self-hosted deployment has no tenant until
     * the first-run wizard creates one, and this service is constructed
     * long before that. It resolves to `null` until then, which is a tick
     * with nothing to clean rather than a failure.
     */
    private readonly resolveTenantId: () => Promise<string | null>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens(): Promise<void> {
    const tenantId = await this.resolveTenantId();
    if (!tenantId) {
      // Nothing set up yet, so nothing to clean — not a failure worth
      // logging on every scheduled tick.
      return;
    }

    const { deletedSessions, deletedVerificationTokens } =
      await this.expiredRecords.deleteExpiredTokens(tenantId);

    this.logger.log(
      `Cleaned up ${deletedSessions} expired session(s) and ${deletedVerificationTokens} expired verification token(s)`,
    );
  }
}
