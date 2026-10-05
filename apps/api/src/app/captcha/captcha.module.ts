import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import { CaptchaController } from './captcha.controller';

@Module({
  imports: [
    AdaptersModule,
    // The editor asks once for each form it draws, and the public site once for
    // each visitor who loads a page with one: generous for a person on a shared
    // address, a wall for a script.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [CaptchaController],
})
export class CaptchaModule {}
