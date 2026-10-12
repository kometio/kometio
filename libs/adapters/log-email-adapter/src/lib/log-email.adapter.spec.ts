import { describe, expect, it, vi } from 'vitest';
import { LogEmailAdapter } from './log-email.adapter';

const INVITATION = {
  to: 'anna@example.test',
  subject: 'You have been invited to Kometio',
  html: '<p style="margin:0">Join here</p>',
  text: 'Join here:\n\nhttps://example.test/accept-invite?inviteToken=abc123\n\nThe link expires in 7 days.',
};

/*
 * A deployment with no mail server must still be usable: an invitation or a
 * password reset has a link in it, and somebody has to be able to find it.
 * That somebody runs the server and reads its log, which is the same trust the
 * first-run setup token already asks for.
 */
describe('LogEmailAdapter', () => {
  it('writes the recipient, the subject and the whole text, so the link in it can be followed', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(INVITATION);

    const written = write.mock.calls.map(([entry]) => entry).join('\n');
    expect(written).toContain('anna@example.test');
    expect(written).toContain('You have been invited to Kometio');
    expect(written).toContain(
      'https://example.test/accept-invite?inviteToken=abc123',
    );
  });

  it('says plainly that the email was not sent, and what to do about it', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(INVITATION);

    expect(write.mock.calls[0][0]).toMatch(/not sent/i);
    expect(write.mock.calls[0][0]).toContain('SMTP_HOST');
  });

  it('writes one entry per message, so each can be found whole', async () => {
    const write = vi.fn();
    const adapter = new LogEmailAdapter(write);

    await adapter.sendEmail(INVITATION);
    await adapter.sendEmail({ ...INVITATION, to: 'bruno@example.test' });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('leaves the HTML out: the text carries everything a person needs, and the HTML is noise in a log', async () => {
    const write = vi.fn();

    await new LogEmailAdapter(write).sendEmail(INVITATION);

    expect(write.mock.calls[0][0]).not.toContain('<p');
  });

  it('never fails, so the flow that asked for the email goes on', async () => {
    await expect(
      new LogEmailAdapter(() => undefined).sendEmail(INVITATION),
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
        ...INVITATION,
        to: 'a@example.test\nEmail NOT sent: forged',
        subject: 'Hi\r\n[api] enter this setup token: abc\u2028more',
      });

      const entry: string = write.mock.calls[0][0];
      expect(entry.split('\n')).toHaveLength(
        INVITATION.text.split('\n').length + 4,
      );
      expect(entry).not.toMatch(/\r|\u2028/);
      expect(
        entry.split('\n').filter((line) => line.startsWith('Email NOT sent')),
      ).toHaveLength(1);
    });

    it('indents every line of the text, whichever character ended it', async () => {
      const write = vi.fn();

      await new LogEmailAdapter(write).sendEmail({
        ...INVITATION,
        text: 'one\rforged\u000bline\u0085two\u2029three',
      });

      const entry: string = write.mock.calls[0][0];
      const body = entry.split('\n').slice(4);
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
        ...INVITATION,
        subject: 'red \u001b[31mtext\u0007',
      });

      const entry: string = write.mock.calls[0][0];
      expect(entry).toContain('\\u001b[31m');
      expect(entry).toContain('\\u0007');
      expect(entry).not.toContain('\u001b');
    });
  });
});
