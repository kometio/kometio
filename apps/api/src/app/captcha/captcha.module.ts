import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import { ApiEnvModule } from '../api-env.module';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';
import { CaptchaController } from './captcha.controller';

@Module({
  imports: [
    AdaptersModule,
    ApiEnvModule,
    // The editor asks once for each form it draws, and the public site once for
    // each visitor who loads a page with one: generous for a person on a shared
    // address, a wall for a script.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [CaptchaController],
  providers: [PublicPagesThrottlerGuard],
})
export class CaptchaModule {}
