/** Implemented by @kometio/mailchimp-newsletter and @kometio/brevo-newsletter — which one runs is an env var choice per deployment (apps/api's createNewsletterPort), not a code fork. Both accept an already-subscribed email idempotently (upsert), so a repeat signup is never an error. */
export interface NewsletterPort {
  subscribe(email: string): Promise<void>;
}

/**
 * The default when no provider is configured (newsletter is an optional
 * feature, unlike email/captcha — a deployment that never sets
 * NEWSLETTER_PROVIDER must keep booting exactly as before, same reasoning
 * as MediaStoragePort's LocalDisk default). A no-op, not an error: a site
 * owner who adds a "newsletter-consent" field or the NewsletterSignup
 * block before configuring a provider gets a harmless silent no-op rather
 * than a 500 on every submission.
 */
export class NoopNewsletterPort implements NewsletterPort {
  async subscribe(): Promise<void> {
    // Intentionally empty.
  }
}
