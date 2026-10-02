import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  COLLECTION_REPOSITORY,
  REUSABLE_SECTION_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { CollectionsController } from './collections.controller';
import type { CollectionsDeps } from './collections.deps';
import { COLLECTIONS_DEPS } from './collections.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [CollectionsController],
  providers: [
    moduleDeps<CollectionsDeps>(COLLECTIONS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      collectionRepository: COLLECTION_REPOSITORY,
      reusableSectionRepository: REUSABLE_SECTION_REPOSITORY,
    }),
  ],
})
export class CollectionsModule {}
