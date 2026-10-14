import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { purgeAuditEvents } from '@kometio/application';
import type { ExpiredRecordsPort } from '@kometio/ports';

/**
 * The activity log is a log, not a history (docs/adr/0130): once a day, what
 * is older than the retention is removed. Single tenant assumed, like the
 * other clean-ups here (docs/adr/0010).
 */
@Injectable()
export class AuditEventsRetentionCleanupService {
  private readonly logger = new Logger(AuditEventsRetentionCleanupService.name);

  constructor(
    private readonly expiredRecords: ExpiredRecordsPort,
    /** A function, as in the other clean-ups: there is no tenant until the first run makes one. */
    private readonly resolveTenantId: () => Promise<string | null>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupExpiredAuditEvents(): Promise<void> {
    const tenantId = await this.resolveTenantId();
    if (!tenantId) return;

    const { deletedEvents } = await purgeAuditEvents(
      { expiredRecords: this.expiredRecords },
      { tenantId, now: new Date() },
    );
    this.logger.log(`Cleaned up ${deletedEvents} expired activity entries`);
  }
}
