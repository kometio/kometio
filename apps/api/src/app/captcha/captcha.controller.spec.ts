import { NotFoundException } from '@nestjs/common';
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
});
