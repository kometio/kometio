import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  MEDIA_STORAGE,
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  PREVIEW_TOKEN_PORT,
  REUSABLE_SECTION_REPOSITORY,
  SEARCH_PORT,
  SITE_LAYOUT_SECTION_REPOSITORY,
  SITE_REPOSITORY,
  SITE_THEME_BLOCK_STYLES_REPOSITORY,
  TAXONOMY_REPOSITORY,
  USER_REPOSITORY,
} from '../adapters/port.tokens';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { ApiEnvModule } from '../api-env.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { moduleDeps } from '../module-deps';
import { PublicPagesController } from './public-pages.controller';
import type { PublicPagesDeps } from './public-pages.deps';
import { PUBLIC_PAGES_DEPS } from './public-pages.tokens';

@Module({
  imports: [
    AdaptersModule,
    DeploymentTenantModule,
    ApiEnvModule,
    // Generous limit tuned for real page-view traffic, not login-attempt
    // strictness (compare AuthModule's throttler) — this endpoint is hit on
    // every public page load, not just a rare auth action. A separate
    // ThrottlerModule instance, not a shared one with AuthModule, so
    // changing one limit can never accidentally change the other.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 120 }] }),
  ],
  controllers: [PublicPagesController],
  providers: [
    moduleDeps<PublicPagesDeps>(PUBLIC_PAGES_DEPS, {
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
      siteLayoutSectionRepository: SITE_LAYOUT_SECTION_REPOSITORY,
      siteThemeBlockStylesRepository: SITE_THEME_BLOCK_STYLES_REPOSITORY,
      taxonomyRepository: TAXONOMY_REPOSITORY,
      reusableSectionRepository: REUSABLE_SECTION_REPOSITORY,
      searchPort: SEARCH_PORT,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
      previewTokenPort: PREVIEW_TOKEN_PORT,
      userRepository: USER_REPOSITORY,
      mediaStorage: MEDIA_STORAGE,
    }),
  ],
})
export class PublicPagesModule {}
