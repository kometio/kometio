import { describe, expect, it } from 'vitest';
import {
  publicNewsletterSettingsSchema,
  subscribeNewsletterBodySchema,
} from './newsletter-requests';

describe('subscribeNewsletterBodySchema', () => {
  it('takes an address, with the honeypot and the captcha token empty when left out', () => {
    expect(
      subscribeNewsletterBodySchema.parse({ email: 'ada@example.test' }),
    ).toEqual({ email: 'ada@example.test', honeypot: '', captchaToken: '' });
  });

  it('refuses what is not an address', () => {
    expect(
      subscribeNewsletterBodySchema.safeParse({ email: 'ada' }).success,
    ).toBe(false);
  });
});

describe('publicNewsletterSettingsSchema', () => {
  it('says whether the signup draws the captcha, and nothing else', () => {
    expect(
      publicNewsletterSettingsSchema.parse({
        captchaEnabled: false,
        providerKey: 'not for a visitor',
      }),
    ).toEqual({ captchaEnabled: false });
  });

  it('does not guess when it is not said', () => {
    expect(publicNewsletterSettingsSchema.safeParse({}).success).toBe(false);
  });
});
