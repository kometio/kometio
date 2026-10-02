import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  PAGE_TRANSLATION_REPOSITORY,
  SITE_REPOSITORY,
  TAXONOMY_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { TaxonomiesController } from './taxonomies.controller';
import type { TaxonomiesDeps } from './taxonomies.deps';
import { TAXONOMIES_DEPS } from './taxonomies.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [TaxonomiesController],
  providers: [
    moduleDeps<TaxonomiesDeps>(TAXONOMIES_DEPS, {
      taxonomyRepository: TAXONOMY_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
    }),
  ],
})
export class TaxonomiesModule {}
