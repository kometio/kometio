import type { EmailMessage, EmailPort } from '@kometio/ports';

/**
 * What a deployment with no mail server does with an email: it writes it
 * where the person who runs the server will look, instead of failing.
 *
 * The emails that matter without a mail server are the ones that carry a
 * link: an invitation, a password reset, the confirmation of a new address.
 * The text of each has the link in it, in full, so the log entry is enough to
 * follow it. The HTML is left out; it says nothing the text does not.
 *
 * It does not throw, on purpose. Failing the request because nobody has set a
 * mail server up would leave a half-done invitation behind (the person is
 * created, the email is not sent) and, for a password reset, would tell anyone
 * who asks which addresses have an account. Reading these entries needs access
 * to the server's log, the same access the first-run setup token asks for, so
 * a link here is no more exposed than the database it opens.
 *
 * Where the entry goes is the caller's: the API hands in its own logger.
 */
export class LogEmailAdapter implements EmailPort {
  constructor(private readonly write: (entry: string) => void) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    const text = message.text
      .split('\n')
      .map((line) => (line === '' ? '' : `    ${line}`))
      .join('\n');
    this.write(
      [
        'Email NOT sent: no mail server is configured (set SMTP_HOST to send email).',
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        '',
        text,
      ].join('\n'),
    );
  }
}
