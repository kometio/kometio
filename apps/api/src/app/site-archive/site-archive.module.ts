import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import { AuthModule } from '../auth/auth.module';
import { SiteArchiveController } from './site-archive.controller';

@Module({
  imports: [
    AdaptersModule,
    AuthModule,
    // A dump of the whole database for something done now and then: more than
    // a person who tries again needs, and nothing for a script to loop on.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 10 }] }),
  ],
  controllers: [SiteArchiveController],
})
export class SiteArchiveModule {}
