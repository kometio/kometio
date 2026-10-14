import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditEventInput, AuditLogPort } from '@kometio/ports';
import { AUDIT_LOG } from '../adapters/port.tokens';

/**
 * Writes an entry of the activity log (docs/adr/0130), and never fails the
 * thing that was done.
 *
 * The log says what happened; it is not part of making it happen. A role that
 * was changed stays changed if the entry could not be written, and the
 * administrator who changed it is not told it failed: the failure is for the
 * server's log, where whoever runs it will see that the activity log is
 * missing something. That is the trade a log is given: it is never the reason
 * an action is refused.
 */
@Injectable()
export class AuditRecorder {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(AUDIT_LOG) private readonly auditLog: AuditLogPort) {}

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.auditLog.record(event);
    } catch (error) {
      this.logger.error(
        `The activity log could not record ${event.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
