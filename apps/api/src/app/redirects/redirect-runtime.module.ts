import { Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { RedirectRuleSets, RedirectTrafficBuffer } from '@kometio/application';
import type {
  MissingPathRepositoryPort,
  RedirectRepositoryPort,
} from '@kometio/ports';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  MISSING_PATH_REPOSITORY,
  REDIRECT_REPOSITORY,
} from '../adapters/port.tokens';
import { REDIRECT_RULE_SETS, REDIRECT_TRAFFIC } from './redirects.tokens';

/** Writes what is left when the process is told to stop. */
class RedirectTraffic
  extends RedirectTrafficBuffer
  implements OnApplicationShutdown
{
  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}

/**
 * The two things the admin routes and the public one share, and that must
 * be one instance each: the compiled rules (a rule written invalidates what
 * a request reads) and the counters (one flush, one batch).
 *
 * Imported by both modules rather than declared in each, for the reason
 * DeploymentTenantModule gives: two caches would answer from two ideas of
 * what the rules are.
 */
@Module({
  imports: [AdaptersModule],
  providers: [
    {
      provide: REDIRECT_RULE_SETS,
      useFactory: (repository: RedirectRepositoryPort) =>
        new RedirectRuleSets(repository),
      inject: [REDIRECT_REPOSITORY],
    },
    {
      provide: REDIRECT_TRAFFIC,
      useFactory: (
        redirects: RedirectRepositoryPort,
        missing: MissingPathRepositoryPort,
      ) => {
        const logger = new Logger('RedirectTraffic');
        return new RedirectTraffic(redirects, missing, {
          onError: (error) =>
            logger.warn(
              `Could not write redirect counts; they are kept for the next try: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
        });
      },
      inject: [REDIRECT_REPOSITORY, MISSING_PATH_REPOSITORY],
    },
  ],
  exports: [REDIRECT_RULE_SETS, REDIRECT_TRAFFIC],
})
export class RedirectRuntimeModule {}
