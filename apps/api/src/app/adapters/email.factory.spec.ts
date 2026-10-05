import { LogEmailAdapter } from '@kometio/log-email-adapter';
import { SmtpEmailAdapter } from '@kometio/smtp-email-adapter';
import { testApiEnv } from '../../test/api-env.test-fixture';
import { createEmailPort } from './email.factory';

const MESSAGE = {
  to: 'anna@example.test',
  subject: 'Reset your password',
  html: '<p>Reset</p>',
  text: 'Reset it here:\n\nhttps://example.test/reset-password?resetToken=abc',
};

describe('createEmailPort', () => {
  it('sends through SMTP when the deployment has a mail server', () => {
    expect(createEmailPort(testApiEnv(), jest.fn())).toBeInstanceOf(
      SmtpEmailAdapter,
    );
  });

  it('writes the emails to the log when it has none, instead of refusing to start', () => {
    const noMailServer = testApiEnv({
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_FROM_ADDRESS: undefined,
    });

    expect(createEmailPort(noMailServer, jest.fn())).toBeInstanceOf(
      LogEmailAdapter,
    );
  });

  it('writes where the API says, so the entry is in the API log with the rest', async () => {
    const write = jest.fn();
    const noMailServer = testApiEnv({ SMTP_HOST: undefined });

    await createEmailPort(noMailServer, write).sendEmail(MESSAGE);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('resetToken=abc');
  });

  it('fails loudly if a host is given without a port, rather than guessing one', () => {
    expect(() =>
      createEmailPort(testApiEnv({ SMTP_PORT: undefined }), jest.fn()),
    ).toThrow(/Missing required environment variable: SMTP_PORT/);
  });
});
