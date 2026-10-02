import { describe, expect, it } from 'vitest';
import { buildPasswordResetEmail } from './password-reset-email.template';

describe('buildPasswordResetEmail', () => {
  const url = 'https://editor.example.com/?resetToken=abc123';

  it('includes the reset URL in both the HTML and text bodies', () => {
    const email = buildPasswordResetEmail('it', url);

    expect(email.html).toContain(url);
    expect(email.text).toContain(url);
    expect(email.subject).toBe('Reimposta la tua password');
  });

  it('is written in English for a person who chose English', () => {
    const email = buildPasswordResetEmail('en', url);

    expect(email.subject).toBe('Reset your password');
    expect(email.text).toContain('The link expires in 1 hour.');
    expect(email.html).toContain(url);
  });
});
