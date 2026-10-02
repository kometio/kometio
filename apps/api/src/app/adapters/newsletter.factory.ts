import { BrevoNewsletterAdapter } from '@kometio/brevo-newsletter';
import { MailchimpNewsletterAdapter } from '@kometio/mailchimp-newsletter';
import { NoopNewsletterPort, type NewsletterPort } from '@kometio/ports';
import { requiredIn, type ApiEnv } from '../../env-schema';

/**
 * No-op unless NEWSLETTER_PROVIDER is set — newsletter is an optional
 * feature (unlike SMTP or the captcha), so a deployment that never sets it
 * boots exactly as before. A provider's own variables are required once
 * that provider is chosen. One port for the newsletter-consent checkbox on
 * a form and for the NewsletterSignup block alike.
 */
export function createNewsletterPort(env: ApiEnv): NewsletterPort {
  switch (env.NEWSLETTER_PROVIDER) {
    case 'mailchimp':
      return new MailchimpNewsletterAdapter({
        apiKey: requiredIn(env, 'MAILCHIMP_API_KEY'),
        audienceId: requiredIn(env, 'MAILCHIMP_AUDIENCE_ID'),
      });
    case 'brevo':
      return new BrevoNewsletterAdapter({
        apiKey: requiredIn(env, 'BREVO_API_KEY'),
        listId: Number(requiredIn(env, 'BREVO_LIST_ID')),
      });
    case undefined:
      return new NoopNewsletterPort();
  }
}
