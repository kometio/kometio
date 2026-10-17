import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  FORM_SUBMISSION_REPOSITORY,
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  SITE_REPOSITORY,
  SITE_THEME_BLOCK_STYLES_REPOSITORY,
  THEME_CATALOG,
} from '../adapters/port.tokens';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { DEPLOYMENT_SITE_RESOLVER } from './deployment-site.resolver';
import { DeploymentSiteModule } from './deployment-site.module';
import { SitesController } from './sites.controller';
import type { SitesDeps } from './sites.deps';
import { SITES_DEPS } from './sites.tokens';

@Module({
  imports: [AdaptersModule, AuditModule, AuthModule, DeploymentSiteModule],
  controllers: [SitesController],
  providers: [
    moduleDeps<SitesDeps>(SITES_DEPS, {
      siteRepository: SITE_REPOSITORY,
      formSubmissionRepository: FORM_SUBMISSION_REPOSITORY,
      siteThemeBlockStylesRepository: SITE_THEME_BLOCK_STYLES_REPOSITORY,
      themeCatalog: THEME_CATALOG,
      deploymentSiteResolver: DEPLOYMENT_SITE_RESOLVER,
      mediaRepository: MEDIA_REPOSITORY,
      mediaStorage: MEDIA_STORAGE,
    }),
  ],
})
export class SitesModule {}
