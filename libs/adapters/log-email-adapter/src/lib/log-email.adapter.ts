import type { EmailMessage, EmailPort } from '@kometio/ports';

/**
 * What a deployment with no mail server does with an email: it writes it
 * where the person who runs the server will look, instead of failing.
 *
 * The emails that matter without a mail server are the ones that carry a
 * link: a password reset, the confirmation of a new address. The text of each
 * has the link in it, in full, so the log entry is enough to follow it. The
 * HTML is left out; it says nothing the text does not. An invitation is not
 * one of them: its link is given to the administrator who made it, and the
 * use case does not send it through here (`EmailPort.delivers`).
 *
 * A link that signs somebody in is kept by the log for as long as the log is
 * kept, so each entry says so to whoever reads it.
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
  readonly delivers = false;

  constructor(private readonly write: (entry: string) => void) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    const text = lines(message.text)
      .map((line) => (line === '' ? '' : `    ${visible(line)}`))
      .join('\n');
    this.write(
      [
        'Email NOT sent: no mail server is configured (set SMTP_HOST to send email).',
        'Anything in it, a link included, is for whoever reads this log: do not share the log.',
        `  To:      ${visible(message.to)}`,
        `  Subject: ${visible(message.subject)}`,
        '',
        text,
      ].join('\n'),
    );
  }
}

/**
 * What a log reader takes for the end of a line: LF and CR, but also the
 * vertical tab, the form feed, NEL and the Unicode separators.
 */
// eslint-disable-next-line no-control-regex
const LINE_BREAK = /\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/;

/**
 * The lines of a text, split on every kind of line end: an entry is one
 * message, and a line that a reader sees as its own (`Email NOT sent…`, a
 * setup token's banner) must not be one a message could write.
 */
function lines(text: string): string[] {
  return text.split(LINE_BREAK);
}

/**
 * A value as one line a person can read: whatever is a control character is
 * written as its code instead of acted on. The recipient, the subject and
 * the words of a message come from forms and profiles that strangers fill
 * in (a demo's visitors; any site's contact form), and the log is read by a
 * person, and by their terminal.
 */
function visible(value: string): string {
  return lines(value)
    .join(' ')
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g,
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
}
