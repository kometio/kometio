import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  MEDIA_USAGE_PORT,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { MediaController } from './media.controller';
import type { MediaDeps } from './media.deps';
import { MEDIA_DEPS } from './media.tokens';

@Module({
  imports: [
    AdaptersModule,
    AuthModule,
    // Security review 2026-08-24, "third pass": authenticated media upload
    // had no rate limiting at all — a single compromised account could fill
    // the storage without limit. 30 a minute per IP is generous for a
    // legitimate editor uploading several images in a row, but it caps
    // automated abuse.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [MediaController],
  providers: [
    moduleDeps<MediaDeps>(MEDIA_DEPS, {
      siteRepository: SITE_REPOSITORY,
      mediaRepository: MEDIA_REPOSITORY,
      mediaStorage: MEDIA_STORAGE,
      mediaUsage: MEDIA_USAGE_PORT,
    }),
  ],
})
export class MediaModule {}
