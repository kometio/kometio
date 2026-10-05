import { Module } from '@nestjs/common';
import { UndeliveredEmailLog } from './undelivered-email-log';

/**
 * Imported explicitly by each module with a controller that reports an email
 * that did not go out, as DeploymentTenantModule is, rather than marked
 * `@Global`: a global module is only in the graph once something imports it,
 * which would break every integration test that builds a smaller one.
 */
@Module({
  providers: [UndeliveredEmailLog],
  exports: [UndeliveredEmailLog],
})
export class EmailsModule {}
