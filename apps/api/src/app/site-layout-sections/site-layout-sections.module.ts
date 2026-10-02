import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  SITE_LAYOUT_SECTION_REPOSITORY,
  SITE_LAYOUT_SECTION_VERSION_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { SiteLayoutSectionsController } from './site-layout-sections.controller';
import type { SiteLayoutSectionsDeps } from './site-layout-sections.deps';
import { SITE_LAYOUT_SECTIONS_DEPS } from './site-layout-sections.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [SiteLayoutSectionsController],
  providers: [
    moduleDeps<SiteLayoutSectionsDeps>(SITE_LAYOUT_SECTIONS_DEPS, {
      siteLayoutSectionRepository: SITE_LAYOUT_SECTION_REPOSITORY,
      siteLayoutSectionVersionRepository:
        SITE_LAYOUT_SECTION_VERSION_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
    }),
  ],
})
export class SiteLayoutSectionsModule {}
