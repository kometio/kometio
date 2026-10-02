import { describe, expect, it } from 'vitest';
import { InvalidCaptchaError } from '@kometio/domain-core';
import { subscribeNewsletter } from './subscribe-newsletter.use-case';
import { FakeCaptchaPort } from '@kometio/testing';
import { FailingNewsletterPort, FakeNewsletterPort } from '@kometio/testing';

describe('subscribeNewsletter', () => {
  function setup() {
    return {
      newsletterPort: new FakeNewsletterPort(),
      captchaPort: new FakeCaptchaPort(),
    };
  }

  it('subscribes the email when the captcha token is valid', async () => {
    const deps = setup();

    await subscribeNewsletter(deps, {
      email: 'visitor@example.com',
      honeypot: '',
      captchaToken: 'valid-token',
    });

    expect(deps.newsletterPort.subscribedEmails).toEqual([
      'visitor@example.com',
    ]);
  });

  it('silently accepts a honeypot-filled submission without subscribing', async () => {
    const deps = setup();

    await expect(
      subscribeNewsletter(deps, {
        email: 'bot@example.com',
        honeypot: 'i-am-a-bot',
        captchaToken: '',
      }),
    ).resolves.not.toThrow();

    expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
  });

  it('rejects an invalid or missing CAPTCHA token', async () => {
    const deps = setup();

    await expect(
      subscribeNewsletter(deps, {
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: '',
      }),
    ).rejects.toThrow(InvalidCaptchaError);
    expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
  });

  it('propagates a newsletter provider failure, unlike submitForm which swallows it', async () => {
    const deps = { ...setup(), newsletterPort: new FailingNewsletterPort() };

    await expect(
      subscribeNewsletter(deps, {
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: 'valid-token',
      }),
    ).rejects.toThrow('Newsletter provider unavailable');
  });
});
