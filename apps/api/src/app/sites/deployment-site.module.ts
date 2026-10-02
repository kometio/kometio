import { Module } from '@nestjs/common';
import type { SiteRepositoryPort } from '@kometio/ports';
import { AdaptersModule } from '../adapters/adapters.module';
import { DEPLOYMENT_LOCALE, SITE_REPOSITORY } from '../adapters/port.tokens';
import { API_ENV, ApiEnvModule } from '../api-env.module';
import type { ApiEnv } from '../../env-schema';
import {
  DEPLOYMENT_SITE_RESOLVER,
  DeploymentSiteResolver,
} from './deployment-site.resolver';
import { DeploymentSiteLocale } from './deployment-site-locale';

/**
 * The site this deployment serves, and the language it is written in — for
 * every module that has to know either: the sites screen, and each one that
 * sends an email (docs/adr/0100). The counterpart of DeploymentTenantModule,
 * and for the same reason: a provider per module would be one resolver per
 * module, each looking up the same site.
 *
 * It used to be SitesModule's alone, which was right while one module asked.
 *
 * Same shape as DeploymentTenantModule's factory: the env var still wins when
 * set, so an existing deployment that pins it keeps working untouched. Absent
 * — the first-run wizard's case — the resolver falls back to the tenant's
 * only site.
 */
@Module({
  imports: [AdaptersModule, ApiEnvModule],
  providers: [
    {
      provide: DEPLOYMENT_SITE_RESOLVER,
      useFactory: (siteRepository: SiteRepositoryPort, env: ApiEnv) =>
        new DeploymentSiteResolver(siteRepository, env.DEFAULT_SITE_ID),
      inject: [SITE_REPOSITORY, API_ENV],
    },
    {
      provide: DEPLOYMENT_LOCALE,
      useFactory: (resolver: DeploymentSiteResolver) =>
        new DeploymentSiteLocale(resolver),
      inject: [DEPLOYMENT_SITE_RESOLVER],
    },
  ],
  exports: [DEPLOYMENT_SITE_RESOLVER, DEPLOYMENT_LOCALE],
})
export class DeploymentSiteModule {}
