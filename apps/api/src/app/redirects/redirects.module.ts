import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  MISSING_PATH_REPOSITORY,
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  REDIRECT_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { RedirectRuntimeModule } from './redirect-runtime.module';
import { RedirectsController } from './redirects.controller';
import type { RedirectsDeps } from './redirects.deps';
import { REDIRECT_RULE_SETS, REDIRECTS_DEPS } from './redirects.tokens';

@Module({
  imports: [AdaptersModule, AuthModule, RedirectRuntimeModule],
  controllers: [RedirectsController],
  providers: [
    moduleDeps<RedirectsDeps>(REDIRECTS_DEPS, {
      redirectRepository: REDIRECT_REPOSITORY,
      missingPathRepository: MISSING_PATH_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      ruleSets: REDIRECT_RULE_SETS,
    }),
  ],
})
export class RedirectsModule {}
