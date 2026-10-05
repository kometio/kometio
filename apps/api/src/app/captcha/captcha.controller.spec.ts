import { NotFoundException } from '@nestjs/common';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';
import { CaptchaController } from './captcha.controller';

describe('CaptchaController', () => {
  it('hands out the challenge the deployment makes', async () => {
    const challenge = { parameters: { nonce: 'n' }, signature: 's' };
    const controller = new CaptchaController({
      createChallenge: async () => challenge,
    });

    expect(await controller.challenge()).toBe(challenge);
  });

  it('answers 404 when the deployment uses Cloudflare Turnstile: there is no challenge to give', async () => {
    await expect(new CaptchaController(null).challenge()).rejects.toThrow(
      NotFoundException,
    );
  });

  /*
   * The public site asks on behalf of each visitor. With the default guard
   * the whole site would be one visitor, and thirty page loads with a form in
   * a minute would answer 429 to everybody (the guard's own comment tells the
   * story for the pages). Its behaviour is its own spec's; this is that the
   * route uses it.
   */
  it('counts the visitor the public site vouches for, not the public site', () => {
    const guards: unknown[] = Reflect.getMetadata(
      '__guards__',
      CaptchaController,
    );

    expect(guards).toContain(PublicPagesThrottlerGuard);
  });
});
