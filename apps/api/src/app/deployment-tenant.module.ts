import { Module } from '@nestjs/common';
import type { TenantDirectoryPort } from '@kometio/ports';
import type { ApiEnv } from '../env-schema';
import { TENANT_DIRECTORY } from './adapters/port.tokens';
import { TenantDirectoryModule } from './adapters/tenant-directory.module';
import { API_ENV, ApiEnvModule } from './api-env.module';
import {
  DEPLOYMENT_TENANT_RESOLVER,
  DeploymentTenantResolver,
} from './deployment-tenant.resolver';

/**
 * One resolver for the whole process, rather than the private
 * `DEFAULT_TENANT_ID` provider each of five modules used to declare for
 * itself. That duplication was harmless while the value came from an env
 * var — every copy read the same string — but it is not harmless now that
 * resolving can mean a database lookup and a cache: five providers would
 * mean five caches, five lookups, and five chances to still be answering
 * "not set up" after the first-run wizard has run.
 *
 * Imported explicitly by the five modules that need it rather than marked
 * `@Global`. A global module is only in the graph once something imports
 * it, which silently held for the real app and broke every integration
 * test that builds a smaller graph — and importing the same module from
 * five places still shares one provider instance, so the explicit version
 * costs nothing and says what it depends on.
 */
@Module({
  imports: [TenantDirectoryModule, ApiEnvModule],
  providers: [
    {
      provide: DEPLOYMENT_TENANT_RESOLVER,
      useFactory: (directory: TenantDirectoryPort, env: ApiEnv) =>
        // The env var still wins when set: development and the integration
        // tests both pin it, and an existing deployment keeps working
        // untouched. Absent, the resolver falls back to the database.
        new DeploymentTenantResolver(directory, env.DEFAULT_TENANT_ID),
      inject: [TENANT_DIRECTORY, API_ENV],
    },
  ],
  exports: [DEPLOYMENT_TENANT_RESOLVER],
})
export class DeploymentTenantModule {}
