import { describe, expect, it } from 'vitest';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('SmtpEmailAdapter construction', () => {
  // nodemailer's SMTP transport connects lazily on first send, so
  // constructing it (with or without credentials) must never throw, even
  // against a host that doesn't exist.
  it('builds a transporter without credentials', () => {
    expect(
      () =>
        new SmtpEmailAdapter({
          host: 'localhost',
          port: 1025,
          fromAddress: 'noreply@kometio.local',
        }),
    ).not.toThrow();
  });

  it('builds a transporter with credentials', () => {
    expect(
      () =>
        new SmtpEmailAdapter({
          host: 'smtp.example.com',
          port: 587,
          fromAddress: 'noreply@kometio.local',
          user: 'someone',
          password: 'secret',
        }),
    ).not.toThrow();
  });

  it('uses implicit TLS on port 465', () => {
    expect(
      () =>
        new SmtpEmailAdapter({
          host: 'smtp.example.com',
          port: 465,
          fromAddress: 'noreply@kometio.local',
        }),
    ).not.toThrow();
  });
});
