import { Module } from '@nestjs/common';
import type {
  PageGeneratorConnection,
  PageGeneratorPort,
  SecretCipherPort,
  SiteAiSettingsRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  PAGE_GENERATOR_FACTORY,
  SECRET_CIPHER,
  SITE_AI_SETTINGS_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { AiSettingsController } from './ai-settings.controller';
import { GeneratePageController } from './generate-page.controller';
import { GenerationSlots } from './generation-slots';
import { PageGenerationDeps } from './page-generation.deps';
import { PAGE_GENERATION_DEPS } from './page-generation.tokens';

/** Pages written at once for one site, whoever asks (see GenerationSlots). */
const MAX_GENERATIONS_PER_SITE = 2;

/** How long the server waits for a page; the editor itself gives up at five minutes. */
const GENERATION_DEADLINE = 4 * 60_000;

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [AiSettingsController, GeneratePageController],
  providers: [
    {
      provide: PAGE_GENERATION_DEPS,
      useFactory: (
        siteRepository: SiteRepositoryPort,
        aiSettingsRepository: SiteAiSettingsRepositoryPort,
        cipher: SecretCipherPort | null,
        createGenerator: (
          connection: PageGeneratorConnection,
        ) => PageGeneratorPort,
      ) =>
        new PageGenerationDeps({
          siteRepository,
          aiSettingsRepository,
          generation: cipher ? { cipher, createGenerator } : null,
          slots: new GenerationSlots(MAX_GENERATIONS_PER_SITE),
          deadlineMs: GENERATION_DEADLINE,
        }),
      inject: [
        SITE_REPOSITORY,
        SITE_AI_SETTINGS_REPOSITORY,
        SECRET_CIPHER,
        PAGE_GENERATOR_FACTORY,
      ],
    },
  ],
})
export class PageGenerationModule {}
