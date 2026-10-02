import { createHash } from 'node:crypto';
import type { NewsletterPort } from '@kometio/ports';

export interface MailchimpNewsletterConfig {
  apiKey: string;
  audienceId: string;
}

/**
 * Mailchimp's data center is embedded in the API key itself (the suffix
 * after the last "-", e.g. a key ending "-us21" lives on the us21 data
 * center) — no separate config value needed for it.
 */
function dataCenterFrom(apiKey: string): string {
  const dc = apiKey.split('-').at(-1);
  if (!dc) {
    throw new Error('Invalid Mailchimp API key: missing data center suffix');
  }
  return dc;
}

/**
 * PUT (upsert by MD5 of the lowercased email — Mailchimp's own required
 * member-id scheme, not a security hash) rather than POST: makes a repeat
 * signup idempotent instead of a "Member Exists" error, matching
 * NewsletterPort's own contract.
 */
export class MailchimpNewsletterAdapter implements NewsletterPort {
  constructor(private readonly config: MailchimpNewsletterConfig) {}

  async subscribe(email: string): Promise<void> {
    const dc = dataCenterFrom(this.config.apiKey);
    const memberHash = createHash('md5')
      .update(email.toLowerCase())
      .digest('hex');
    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${this.config.audienceId}/members/${memberHash}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`anystring:${this.config.apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: 'subscribed',
        status: 'subscribed',
      }),
    });

    if (!response.ok) {
      throw new Error(`Mailchimp subscribe failed: ${response.status}`);
    }
  }
}
