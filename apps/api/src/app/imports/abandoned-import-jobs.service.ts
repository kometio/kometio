import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { failAbandonedImportJobs } from '@kometio/application';
import type { ImportJobRepositoryPort } from '@kometio/ports';

/**
 * Closes the jobs that were being read when the process stopped.
 *
 * The reading happens inside this process (docs/adr/0082 — no queue, one
 * API container per site), so a job still marked as running after a
 * restart has nobody doing it. Left alone, the editor would poll it
 * forever; a restart in the middle is a real thing that happens, and
 * saying so is the honest version of it.
 *
 * At bootstrap and not on a schedule: the only way a job is abandoned is
 * that the process holding it went away, and this is the moment it comes
 * back.
 */
@Injectable()
export class AbandonedImportJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AbandonedImportJobsService.name);

  constructor(
    private readonly importJobRepository: ImportJobRepositoryPort,
    /** Resolves to `null` until the first-run wizard has created a tenant. */
    private readonly resolveTenantId: () => Promise<string | null>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tenantId = await this.resolveTenantId();
    if (!tenantId) return;

    const closed = await failAbandonedImportJobs(
      { importJobRepository: this.importJobRepository },
      { tenantId },
    );
    if (closed > 0) {
      this.logger.log(
        `Marked ${closed} import job(s) as failed: they were still being read when the server last stopped`,
      );
    }
  }
}
