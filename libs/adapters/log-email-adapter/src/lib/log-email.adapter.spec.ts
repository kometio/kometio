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
});
