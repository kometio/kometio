import { describe, expect, it, vi } from 'vitest';
import { LogEmailAdapter } from './log-email.adapter';

const RESET = {
  to: 'anna@example.test',
  subject: 'Reset your Kometio password',
  html: '<p style="margin:0">Reset it here</p>',
  text: 'Reset it here:\n\nhttps://example.test/reset-password?token=abc123\n\nThe link expires in 1 hour.',
};

/** What comes before the text in an entry: the verdict, the warning, the recipient, the subject, a blank. */
const HEADER_LINES = 5;

/*
 * A deployment with no mail server must still be usable: a password reset has
 * a link in it, and somebody has to be able to find it.
 * That somebody runs the server and reads its log, which is the same trust the
 * first-run setup token already asks for.
 */
describe('LogEmailAdapter', () => {
  it('writes the recipient, the subject and the whole text, so the link in it can be followed', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(RESET);

    const written = write.mock.calls.map(([entry]) => entry).join('\n');
    expect(written).toContain('anna@example.test');
    expect(written).toContain('Reset your Kometio password');
    expect(written).toContain(
      'https://example.test/reset-password?token=abc123',
    );
  });

  it('says plainly that the email was not sent, and what to do about it', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(RESET);

    expect(write.mock.calls[0][0]).toMatch(/not sent/i);
    expect(write.mock.calls[0][0]).toContain('SMTP_HOST');
  });

  it('warns whoever reads it that a link in it is theirs, and not to be shared', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(RESET);

    expect(write.mock.calls[0][0]).toMatch(/link included/i);
    expect(write.mock.calls[0][0]).toMatch(/do not share the log/i);
  });

  it('is not a mail server: what asks whether an email is delivered is told no', () => {
    expect(new LogEmailAdapter(() => undefined).delivers).toBe(false);
  });

  it('writes one entry per message, so each can be found whole', async () => {
    const write = vi.fn();
    const adapter = new LogEmailAdapter(write);

    await adapter.sendEmail(RESET);
    await adapter.sendEmail({ ...RESET, to: 'bruno@example.test' });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('leaves the HTML out: the text carries everything a person needs, and the HTML is noise in a log', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(RESET);

    expect(write.mock.calls[0][0]).not.toContain('<p');
  });

  it('never fails, so the flow that asked for the email goes on', async () => {
    await expect(
      new LogEmailAdapter(() => undefined).sendEmail(RESET),
    ).resolves.toBeUndefined();
  });

  /*
   * The words of an email can be a stranger's — a contact form's field, a
   * profile's name, in a demo anybody's — and the log is read by a person and
   * by their terminal: nothing in it may forge another entry or move a cursor.
   */
  describe('with words that are somebody else’s', () => {
    it('keeps a subject or a recipient to one line, whatever the line ends are', async () => {
      const write = vi.fn();

      await new LogEmailAdapter(write).sendEmail({
        ...RESET,
        to: 'a@example.test\nEmail NOT sent: forged',
        subject: 'Hi\r\n[api] enter this setup token: abc\u2028more',
      });

      const entry: string = write.mock.calls[0][0];
      expect(entry.split('\n')).toHaveLength(
        RESET.text.split('\n').length + HEADER_LINES,
      );
      expect(entry).not.toMatch(/\r|\u2028/);
      expect(
        entry.split('\n').filter((line) => line.startsWith('Email NOT sent')),
      ).toHaveLength(1);
    });

    it('indents every line of the text, whichever character ended it', async () => {
      const write = vi.fn();

      await new LogEmailAdapter(write).sendEmail({
        ...RESET,
        text: 'one\rforged\u000bline\u0085two\u2029three',
      });

      const entry: string = write.mock.calls[0][0];
      const body = entry.split('\n').slice(HEADER_LINES);
      expect(body).toEqual([
        '    one',
        '    forged',
        '    line',
        '    two',
        '    three',
      ]);
    });

    it('writes the other control characters as their codes: a terminal is not to act on them', async () => {
      const write = vi.fn();

      await new LogEmailAdapter(write).sendEmail({
        ...RESET,
        subject: 'red \u001b[31mtext\u0007',
      });

      const entry: string = write.mock.calls[0][0];
      expect(entry).toContain('\\u001b[31m');
      expect(entry).toContain('\\u0007');
      expect(entry).not.toContain('\u001b');
    });
  });
});
