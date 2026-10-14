import type { EmailMessage, EmailPort } from '@kometio/ports';

/** Records sent emails in-memory instead of actually delivering them. */
export class FakeEmailPort implements EmailPort {
  /** A server with no mail server: `false` makes the use cases that ask give the link to a person instead. */
  delivers = true;
  readonly sentEmails: EmailMessage[] = [];
  private failure: Error | null = null;

  /** From now on every send fails with `error` and records nothing — a mail server that is down. */
  failEverySendWith(error: Error): void {
    this.failure = error;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.sentEmails.push(message);
  }
}
