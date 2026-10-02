import type { NewsletterPort } from '@kometio/ports';

const CONTACTS_URL = 'https://api.brevo.com/v3/contacts';

export interface BrevoNewsletterConfig {
  apiKey: string;
  listId: number;
}

/**
 * `updateEnabled: true` makes a repeat signup idempotent (updates the
 * existing contact instead of erroring), matching NewsletterPort's own
 * contract — same reasoning as the Mailchimp adapter's PUT-by-hash upsert.
 */
export class BrevoNewsletterAdapter implements NewsletterPort {
  constructor(private readonly config: BrevoNewsletterConfig) {}

  async subscribe(email: string): Promise<void> {
    const response = await fetch(CONTACTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [this.config.listId],
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo subscribe failed: ${response.status}`);
    }
  }
}
