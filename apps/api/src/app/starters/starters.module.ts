import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  COLLECTION_REPOSITORY,
  FORM_REPOSITORY,
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  REUSABLE_SECTION_REPOSITORY,
  SEARCH_PORT,
  SITE_LAYOUT_SECTION_REPOSITORY,
  SITE_LAYOUT_SECTION_VERSION_REPOSITORY,
  SITE_REPOSITORY,
  TAXONOMY_REPOSITORY,
  THEME_CATALOG,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { StartersController } from './starters.controller';
import type { StartersDeps } from './starters.deps';
import { STARTERS_DEPS } from './starters.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [StartersController],
  providers: [
    moduleDeps<StartersDeps>(STARTERS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      collectionRepository: COLLECTION_REPOSITORY,
      formRepository: FORM_REPOSITORY,
      taxonomyRepository: TAXONOMY_REPOSITORY,
      siteLayoutSectionRepository: SITE_LAYOUT_SECTION_REPOSITORY,
      siteLayoutSectionVersionRepository:
        SITE_LAYOUT_SECTION_VERSION_REPOSITORY,
      reusableSectionRepository: REUSABLE_SECTION_REPOSITORY,
      searchPort: SEARCH_PORT,
      themeCatalog: THEME_CATALOG,
    }),
  ],
})
export class StartersModule {}
