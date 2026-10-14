import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  COLLECTION_REPOSITORY,
  CONTENT_SANITIZER,
  PAGE_GROUP_REPOSITORY,
  PAGE_GROUP_VERSION_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  PAGE_TRANSLATION_VERSION_REPOSITORY,
  PREVIEW_TOKEN_PORT,
  REUSABLE_SECTION_REPOSITORY,
  REUSABLE_SECTION_VERSION_REPOSITORY,
  SEARCH_PORT,
  SITE_REPOSITORY,
  TAXONOMY_REPOSITORY,
  USER_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import {
  DEPLOYMENT_TENANT_RESOLVER,
  type DeploymentTenantResolver,
} from '../deployment-tenant.resolver';
import { moduleDeps } from '../module-deps';
import { ReusableSectionRecords } from '../reusable-sections/reusable-section-records';
import { PageGroupsController } from './page-groups.controller';
import { PageRecords } from './page-records';
import { PageTranslationsController } from './page-translations.controller';
import type { PagesDeps } from './pages.deps';
import { PAGES_DEPS } from './pages.tokens';
import { ScheduledPublishService } from './scheduled-publish.service';

@Module({
  imports: [AdaptersModule, AuthModule, DeploymentTenantModule],
  controllers: [PageGroupsController, PageTranslationsController],
  providers: [
    moduleDeps<PagesDeps>(PAGES_DEPS, {
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageGroupVersionRepository: PAGE_GROUP_VERSION_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      pageTranslationVersionRepository: PAGE_TRANSLATION_VERSION_REPOSITORY,
      previewTokenPort: PREVIEW_TOKEN_PORT,
      searchPort: SEARCH_PORT,
      reusableSectionRepository: REUSABLE_SECTION_REPOSITORY,
      taxonomyRepository: TAXONOMY_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
      contentSanitizer: CONTENT_SANITIZER,
      collectionRepository: COLLECTION_REPOSITORY,
      reusableSectionVersionRepository: REUSABLE_SECTION_VERSION_REPOSITORY,
      userRepository: USER_REPOSITORY,
    }),
    // "Save as template" answers with a section, in the same shape the
    // sections module does (docs/adr/0072).
    ReusableSectionRecords,
    PageRecords,
    // Publishing at a moment (docs/adr/0135): a tick of the API.
    {
      provide: ScheduledPublishService,
      useFactory: (deps: PagesDeps, tenant: DeploymentTenantResolver) =>
        new ScheduledPublishService(deps, () => tenant.resolve()),
      inject: [PAGES_DEPS, DEPLOYMENT_TENANT_RESOLVER],
    },
  ],
})
export class PagesModule {}
