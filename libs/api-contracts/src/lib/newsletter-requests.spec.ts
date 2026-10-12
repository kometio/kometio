import { describe, expect, it } from 'vitest';
import { subscribeNewsletterBodySchema } from './newsletter-requests';

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
