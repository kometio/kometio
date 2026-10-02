import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  PREVIEW_TOKEN_PORT,
  REUSABLE_SECTION_REPOSITORY,
  REUSABLE_SECTION_VERSION_REPOSITORY,
  SEARCH_PORT,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { ReusableSectionRecords } from './reusable-section-records';
import { ReusableSectionsController } from './reusable-sections.controller';
import type { ReusableSectionsDeps } from './reusable-sections.deps';
import { REUSABLE_SECTIONS_DEPS } from './reusable-sections.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [ReusableSectionsController],
  providers: [
    moduleDeps<ReusableSectionsDeps>(REUSABLE_SECTIONS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      reusableSectionRepository: REUSABLE_SECTION_REPOSITORY,
      reusableSectionVersionRepository: REUSABLE_SECTION_VERSION_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      searchPort: SEARCH_PORT,
      previewTokenPort: PREVIEW_TOKEN_PORT,
    }),
    ReusableSectionRecords,
  ],
})
export class ReusableSectionsModule {}
