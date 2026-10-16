import { describe, expect, it } from 'vitest';
import { InvalidCaptchaError, SiteNotFoundError } from '@kometio/domain-core';
import { subscribeNewsletter } from './subscribe-newsletter.use-case';
import {
  FakeCaptchaPort,
  FailingNewsletterPort,
  FakeNewsletterPort,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';

describe('subscribeNewsletter', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup(newsletterCaptchaEnabled = true) {
    return {
      newsletterPort: new FakeNewsletterPort(),
      captchaPort: new FakeCaptchaPort(),
      siteRepository: new InMemorySiteRepository(
        buildSite({ id: siteId, tenantId, newsletterCaptchaEnabled }),
      ),
    };
  }

  it('subscribes the email when the captcha token is valid', async () => {
    const deps = setup();

    await subscribeNewsletter(deps, {
      tenantId,
      siteId,
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
        tenantId,
        siteId,
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
        tenantId,
        siteId,
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: '',
      }),
    ).rejects.toThrow(InvalidCaptchaError);
    expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
  });

  describe('on a site that asks for no captcha (docs/adr/0145)', () => {
    it('subscribes the email with no token', async () => {
      const deps = setup(false);

      await subscribeNewsletter(deps, {
        tenantId,
        siteId,
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: '',
      });

      expect(deps.newsletterPort.subscribedEmails).toEqual([
        'visitor@example.com',
      ]);
    });

    it('still drops what the honeypot catches', async () => {
      const deps = setup(false);

      await subscribeNewsletter(deps, {
        tenantId,
        siteId,
        email: 'bot@example.com',
        honeypot: 'i-am-a-bot',
        captchaToken: '',
      });

      expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
    });
  });

  it('is refused for a site that is not found, rather than taken as one that asks for nothing', async () => {
    const deps = setup(false);

    await expect(
      subscribeNewsletter(deps, {
        tenantId,
        siteId: 'another-site',
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: '',
      }),
    ).rejects.toThrow(SiteNotFoundError);
    expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
  });

  it('propagates a newsletter provider failure, unlike submitForm which swallows it', async () => {
    const deps = { ...setup(), newsletterPort: new FailingNewsletterPort() };

    await expect(
      subscribeNewsletter(deps, {
        tenantId,
        siteId,
        email: 'visitor@example.com',
        honeypot: '',
        captchaToken: 'valid-token',
      }),
    ).rejects.toThrow('Newsletter provider unavailable');
  });
});
