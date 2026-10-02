import type { NewsletterPort } from '@kometio/ports';

/** Records subscribed emails in-memory instead of calling a real provider. */
export class FakeNewsletterPort implements NewsletterPort {
  readonly subscribedEmails: string[] = [];

  async subscribe(email: string): Promise<void> {
    this.subscribedEmails.push(email);
  }
}

/** Always fails — used to verify a newsletter provider outage never fails the form submission itself. */
export class FailingNewsletterPort implements NewsletterPort {
  async subscribe(): Promise<void> {
    throw new Error('Newsletter provider unavailable');
  }
}
