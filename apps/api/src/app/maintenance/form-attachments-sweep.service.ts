import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  sweepFormAttachments,
  type SweepFormAttachmentsDeps,
} from '@kometio/application';

/** How long an upload waits for the submission that names it before it counts as abandoned. */
const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Removes the form attachments no submission names any more — abandoned
 * uploads, and the files of submissions that retention deleted (see
 * sweepFormAttachments). An hour after the retention job, so a
 * submission it deletes tonight loses its file tonight too.
 *
 * Single tenant assumed (docs/adr/0010), like the retention job.
 */
@Injectable()
export class FormAttachmentsSweepService {
  private readonly logger = new Logger(FormAttachmentsSweepService.name);

  constructor(
    private readonly deps: SweepFormAttachmentsDeps,
    private readonly resolveTenantId: () => Promise<string | null>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async sweep(): Promise<void> {
    const tenantId = await this.resolveTenantId();
    if (!tenantId) return;
    const { deleted } = await sweepFormAttachments(this.deps, {
      tenantId,
      storedBefore: new Date(this.now().getTime() - GRACE_MS),
    });
    this.logger.log(
      `Removed ${deleted} form attachment(s) no submission names`,
    );
  }
}
