import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  FORM_SUBMISSION_REPOSITORY,
  SITE_REPOSITORY,
  SITE_THEME_BLOCK_STYLES_REPOSITORY,
  THEME_CATALOG,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { DEPLOYMENT_SITE_RESOLVER } from './deployment-site.resolver';
import { DeploymentSiteModule } from './deployment-site.module';
import { SitesController } from './sites.controller';
import type { SitesDeps } from './sites.deps';
import { SITES_DEPS } from './sites.tokens';

@Module({
  imports: [AdaptersModule, AuthModule, DeploymentSiteModule],
  controllers: [SitesController],
  providers: [
    moduleDeps<SitesDeps>(SITES_DEPS, {
      siteRepository: SITE_REPOSITORY,
      formSubmissionRepository: FORM_SUBMISSION_REPOSITORY,
      siteThemeBlockStylesRepository: SITE_THEME_BLOCK_STYLES_REPOSITORY,
      themeCatalog: THEME_CATALOG,
      deploymentSiteResolver: DEPLOYMENT_SITE_RESOLVER,
    }),
  ],
})
export class SitesModule {}
