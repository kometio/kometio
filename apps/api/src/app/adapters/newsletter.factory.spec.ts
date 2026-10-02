import { BrevoNewsletterAdapter } from '@kometio/brevo-newsletter';
import { MailchimpNewsletterAdapter } from '@kometio/mailchimp-newsletter';
import { NoopNewsletterPort } from '@kometio/ports';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { createNewsletterPort } from './newsletter.factory';

describe('createNewsletterPort', () => {
  it('is a no-op when NEWSLETTER_PROVIDER is unset', () => {
    expect(createNewsletterPort(testApiEnv())).toBeInstanceOf(
      NoopNewsletterPort,
    );
  });

  it('builds the Mailchimp adapter, and fails loudly without its key', () => {
    const mailchimp = testApiEnv({
      NEWSLETTER_PROVIDER: 'mailchimp',
      MAILCHIMP_API_KEY: 'an-invented-key-us1',
      MAILCHIMP_AUDIENCE_ID: 'audience-1',
    });

    expect(createNewsletterPort(mailchimp)).toBeInstanceOf(
      MailchimpNewsletterAdapter,
    );
    expect(() =>
      createNewsletterPort({ ...mailchimp, MAILCHIMP_API_KEY: undefined }),
    ).toThrow(/Missing required environment variable: MAILCHIMP_API_KEY/);
  });

  it('builds the Brevo adapter, and fails loudly without its key', () => {
    const brevo = testApiEnv({
      NEWSLETTER_PROVIDER: 'brevo',
      BREVO_API_KEY: 'an-invented-key',
      BREVO_LIST_ID: '7',
    });

    expect(createNewsletterPort(brevo)).toBeInstanceOf(BrevoNewsletterAdapter);
    expect(() =>
      createNewsletterPort({ ...brevo, BREVO_API_KEY: undefined }),
    ).toThrow(/Missing required environment variable: BREVO_API_KEY/);
  });
});
