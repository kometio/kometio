import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { subscribeNewsletter } from '@kometio/application';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';
import {
  type SubscribeNewsletterBody,
  subscribeNewsletterBodySchema,
} from '@kometio/api-contracts';
import type { PublicNewsletterDeps } from './public-newsletter.deps';
import { PUBLIC_NEWSLETTER_DEPS } from './public-newsletter.tokens';

// Same reasoning as PublicFormsController: no SessionAuthGuard (the public,
// unauthenticated path apps/public-site's NewsletterSignup block posts
// through via its own same-origin proxy), and a throttle tuned for a write
// endpoint a spam bot actually wants to hit repeatedly, counted per visitor
// rather than per address, as PublicFormsController's is.
@Controller('public/newsletter')
@UseGuards(PublicPagesThrottlerGuard)
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
    // The site is this deployment's own, never one the request names: the
    // captcha is asked for, or not, by its setting (docs/adr/0145).
    const tenantId = await this.deps.tenant.require();
    const site = await this.deps.deploymentSiteResolver.require(tenantId);
    // An invalid captcha is the global table's 400 (domain-error-http-mapping).
    await subscribeNewsletter(this.deps, {
      tenantId,
      siteId: site.id,
      email: body.email,
      honeypot: body.honeypot,
      captchaToken: body.captchaToken,
    });
  }
}
