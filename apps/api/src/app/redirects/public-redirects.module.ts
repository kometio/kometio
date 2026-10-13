import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { ApiEnvModule } from '../api-env.module';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { moduleDeps } from '../module-deps';
import { RedirectRuntimeModule } from './redirect-runtime.module';
import { PublicRedirectsController } from './public-redirects.controller';
import type { PublicRedirectsDeps } from './redirects.deps';
import {
  PUBLIC_REDIRECTS_DEPS,
  REDIRECT_RULE_SETS,
  REDIRECT_TRAFFIC,
} from './redirects.tokens';

@Module({
  imports: [
    AdaptersModule,
    DeploymentTenantModule,
    ApiEnvModule,
    RedirectRuntimeModule,
    // Its own instance, as the public pages' is: this is asked on the
    // same page views, and its limit is not to be changed by changing theirs.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 120 }] }),
  ],
  controllers: [PublicRedirectsController],
  providers: [
    moduleDeps<PublicRedirectsDeps>(PUBLIC_REDIRECTS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      ruleSets: REDIRECT_RULE_SETS,
      traffic: REDIRECT_TRAFFIC,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
    }),
  ],
})
export class PublicRedirectsModule {}
