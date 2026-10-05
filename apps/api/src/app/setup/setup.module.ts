import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  AUTH_PORT,
  DEPLOYMENT_BOOTSTRAP_PORT,
  SITE_IMPORT,
} from '../adapters/port.tokens';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { ApiEnvModule } from '../api-env.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { moduleDeps } from '../module-deps';
import { SessionCookies } from '../auth/session-cookies';
import { SetupTokenRegistry } from './setup-token.registry';
import { SetupController } from './setup.controller';
import type { SetupDeps } from './setup.deps';
import { SETUP_DEPS } from './setup.tokens';

@Module({
  imports: [
    AdaptersModule,
    DeploymentTenantModule,
    ApiEnvModule,
    // Same window and limit AuthModule uses for login. Declared here rather
    // than shared: ThrottlerModule.forRoot is per-module in this codebase.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 5 }] }),
  ],
  controllers: [SetupController],
  providers: [
    moduleDeps<SetupDeps>(SETUP_DEPS, {
      deploymentBootstrapPort: DEPLOYMENT_BOOTSTRAP_PORT,
      authPort: AUTH_PORT,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
      siteImport: SITE_IMPORT,
    }),
    SetupTokenRegistry,
    SessionCookies,
  ],
})
export class SetupModule {}
