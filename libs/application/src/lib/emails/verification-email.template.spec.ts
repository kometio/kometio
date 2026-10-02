import { describe, expect, it } from 'vitest';
import { buildVerificationEmail } from './verification-email.template';

describe('buildVerificationEmail', () => {
  const url = 'https://editor.example.com/?verifyToken=abc123';

  it('includes the verification URL in both the HTML and text bodies', () => {
    const email = buildVerificationEmail('it', url);

    expect(email.html).toContain(url);
    expect(email.text).toContain(url);
    expect(email.subject).toBe('Verifica il tuo indirizzo email');
  });

  it('is written in English for a person who chose English', () => {
    const email = buildVerificationEmail('en', url);

    expect(email.subject).toBe('Verify your email address');
    expect(email.text).toContain('The link expires in 24 hours.');
    expect(email.html).toContain(url);
  });
});
