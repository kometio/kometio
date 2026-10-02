import { describe, expect, it } from 'vitest';
import { buildEmailChangeEmail } from './email-change-email.template';

describe('buildEmailChangeEmail', () => {
  const url = 'https://editor.example.com/confirm-email-change?changeToken=abc';

  it('includes the confirmation URL in both the HTML and text bodies', () => {
    const email = buildEmailChangeEmail('it', url);

    expect(email.html).toContain(url);
    expect(email.text).toContain(url);
    expect(email.subject).toBe('Conferma il tuo nuovo indirizzo email');
  });

  it('says what to do if the person did not ask for it', () => {
    expect(buildEmailChangeEmail('it', url).text).toContain(
      'ignora questo messaggio',
    );
    expect(buildEmailChangeEmail('en', url).text).toContain(
      'ignore this message',
    );
  });

  it('is written in English for a person who chose English', () => {
    const email = buildEmailChangeEmail('en', url);

    expect(email.subject).toBe('Confirm your new email address');
    expect(email.html).toContain(url);
  });
});
