import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { CaptchaChallenge, CaptchaChallengePort } from '@kometio/ports';
import { CAPTCHA_CHALLENGE_PORT } from '../adapters/port.tokens';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';

/**
 * The challenge of the captcha built into Kometio (docs/adr/0103), for the
 * widget to solve: the editor's login and, through the public site, the forms.
 *
 * Open to anyone, because the visitor who needs it has no account, and limited
 * per visitor like the other public routes: the public site asks for it on
 * behalf of a visitor, and says whose, so a busy minute on one site does not
 * count as one visitor (the guard's own comment says why). A challenge is useless until it is
 * solved, and each takes the visitor's browser a moment to solve, so handing
 * them out is not what a script would gain from; what the limit keeps is the
 * server from signing them for nothing.
 *
 * A deployment with Cloudflare Turnstile has no such challenge to give, and
 * says so with a 404: nothing there is waiting for one.
 */
@Controller('captcha')
@UseGuards(PublicPagesThrottlerGuard)
export class CaptchaController {
  constructor(
    @Inject(CAPTCHA_CHALLENGE_PORT)
    private readonly challenges: CaptchaChallengePort | null,
  ) {}

  // Never from a cache: a challenge handed to two visitors is a solution that
  // can be spent once between them.
  @Get('challenge')
  @Header('Cache-Control', 'no-store')
  async challenge(): Promise<CaptchaChallenge> {
    if (this.challenges === null) {
      throw new NotFoundException(
        'This deployment uses Cloudflare Turnstile: there is no challenge to give',
      );
    }
    return this.challenges.createChallenge();
  }
}
