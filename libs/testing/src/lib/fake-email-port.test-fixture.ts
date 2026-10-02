import type { EmailMessage, EmailPort } from '@kometio/ports';

/** Records sent emails in-memory instead of actually delivering them. */
export class FakeEmailPort implements EmailPort {
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
