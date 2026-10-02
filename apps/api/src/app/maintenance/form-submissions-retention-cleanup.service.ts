import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ExpiredRecordsPort } from '@kometio/ports';

/**
 * Single tenant assumed (docs/adr/0010), same as ExpiredTokensCleanupService
 * — a genuinely multi-tenant deployment would need to iterate every tenant
 * here instead. Per-site opt-in (`sites.form_submission_retention_days`,
 * `null` by default = never deletes anything for that site) — see
 * ExpiredRecordsPort's own doc comment.
 */
@Injectable()
export class FormSubmissionsRetentionCleanupService {
  private readonly logger = new Logger(
    FormSubmissionsRetentionCleanupService.name,
  );

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

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupExpiredFormSubmissions(): Promise<void> {
    const tenantId = await this.resolveTenantId();
    if (!tenantId) {
      // Nothing set up yet, so nothing to clean — not a failure worth
      // logging on every scheduled tick.
      return;
    }

    const { deletedSubmissions } =
      await this.expiredRecords.deleteExpiredFormSubmissions(tenantId);

    this.logger.log(
      `Cleaned up ${deletedSubmissions} expired form submission(s)`,
    );
  }
}
