import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import { CAPTCHA_PORT, NEWSLETTER_PORT } from '../adapters/port.tokens';
import { moduleDeps } from '../module-deps';
import { PublicNewsletterController } from './public-newsletter.controller';
import type { PublicNewsletterDeps } from './public-newsletter.deps';
import { PUBLIC_NEWSLETTER_DEPS } from './public-newsletter.tokens';

@Module({
  imports: [
    AdaptersModule,
    // Same throttle as PublicFormsModule — a write endpoint is exactly
    // what a spam bot wants to hit repeatedly.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 10 }] }),
  ],
  controllers: [PublicNewsletterController],
  providers: [
    moduleDeps<PublicNewsletterDeps>(PUBLIC_NEWSLETTER_DEPS, {
      captchaPort: CAPTCHA_PORT,
      newsletterPort: NEWSLETTER_PORT,
    }),
  ],
})
export class PublicNewsletterModule {}
