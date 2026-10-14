import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { publishDuePageTranslations } from '@kometio/application';
import type { PagesDeps } from './pages.deps';

/**
 * Publishes what was scheduled to be published (docs/adr/0135): once a
 * minute, every language whose moment has come, each as the person who set
 * it. The one process that serves the API is the one that does it, as for
 * every other recurring job here; a second process would find the rows
 * already published and do nothing.
 *
 * Single tenant assumed, as in the cleanup services (docs/adr/0010).
 */
@Injectable()
export class ScheduledPublishService {
  private readonly logger = new Logger(ScheduledPublishService.name);
  /** A tick that is slow (a large site, a search index that is) is not overtaken by the next one. */
  private running = false;

  constructor(
    private readonly deps: PagesDeps,
    /**
     * A function, not an id: a self-hosted deployment has no tenant until the
     * first-run wizard creates one, and this is constructed long before. It
     * resolves to `null` until then, which is a tick with nothing to do.
     */
    private readonly resolveTenantId: () => Promise<string | null>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenantId = await this.resolveTenantId();
      if (tenantId) await this.publishDue(tenantId);
    } catch (error) {
      // Never an unhandled rejection out of a timer: the next tick is a
      // minute away and tries again.
      this.logger.error(
        `Scheduled publishing could not run: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** What one tick does for one tenant; separate from `tick` so that it can be asked directly. */
  async publishDue(tenantId: string, now?: Date): Promise<void> {
    const result = await publishDuePageTranslations(this.deps, {
      tenantId,
      now,
    });
    // Nothing to say on the minutes when nothing was due.
    if (result.published === 0 && result.failed === 0) return;
    this.logger.log(
      `Scheduled publishing: ${result.published} published, ${result.failed} not (still scheduled, with the reason on the page)`,
    );
    if (result.notIndexed > 0) {
      this.logger.warn(
        `${result.notIndexed} of them are online but were not added to the search: publishing them again does it`,
      );
    }
  }
}
