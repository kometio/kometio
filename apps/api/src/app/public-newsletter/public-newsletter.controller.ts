import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { subscribeNewsletter } from '@kometio/application';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type SubscribeNewsletterBody,
  subscribeNewsletterBodySchema,
} from './public-newsletter.schemas';
import type { PublicNewsletterDeps } from './public-newsletter.deps';
import { PUBLIC_NEWSLETTER_DEPS } from './public-newsletter.tokens';

// Same reasoning as PublicFormsController: no SessionAuthGuard (the public,
// unauthenticated path apps/public-site's NewsletterSignup block posts
// through via its own same-origin proxy), ThrottlerGuard tuned for a write
// endpoint a spam bot actually wants to hit repeatedly.
@Controller('public/newsletter')
@UseGuards(ThrottlerGuard)
export class PublicNewsletterController {
  constructor(
    @Inject(PUBLIC_NEWSLETTER_DEPS) private readonly deps: PublicNewsletterDeps,
  ) {}

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @Body(new ZodValidationPipe(subscribeNewsletterBodySchema))
    body: SubscribeNewsletterBody,
  ): Promise<void> {
    // An invalid captcha is the global table's 400 (domain-error-http-mapping).
    await subscribeNewsletter(this.deps, {
      email: body.email,
      honeypot: body.honeypot,
      captchaToken: body.captchaToken,
    });
  }
}
