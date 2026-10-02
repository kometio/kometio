import { describe, expect, it } from 'vitest';
import {
  buildEmailChangedEmail,
  buildPasswordChangedEmail,
} from './sign-in-changed-emails.template';

const loginUrl = 'https://editor.example.com/login';

describe('buildPasswordChangedEmail', () => {
  it('says the password was changed and what to do if it was not the person', () => {
    const email = buildPasswordChangedEmail('it', loginUrl);

    expect(email.subject).toBe('La tua password è stata cambiata');
    expect(email.text).toContain('è stata appena cambiata');
    expect(email.text).toContain('Se non sei stato tu a cambiare la password');
    expect(email.html).toContain(loginUrl);
    expect(email.text).toContain(loginUrl);
  });

  it('says it in English for a person who chose English', () => {
    const email = buildPasswordChangedEmail('en', loginUrl);

    expect(email.subject).toBe('Your password was changed');
    expect(email.text).toContain('has just been changed');
    expect(email.text).toContain('If it was not you who changed the password');
    expect(email.html).toContain(loginUrl);
  });
});

describe('buildEmailChangedEmail', () => {
  it('names both addresses and says what to do if it was not the person', () => {
    const email = buildEmailChangedEmail(
      'it',
      'vecchio@example.com',
      'nuovo@example.com',
      loginUrl,
    );

    expect(email.subject).toBe('Il tuo indirizzo di accesso è stato cambiato');
    expect(email.text).toContain('da vecchio@example.com a nuovo@example.com');
    expect(email.text).toContain("Se non sei stato tu a cambiare l'indirizzo");
    expect(email.html).toContain(loginUrl);
  });

  it('names both addresses in English too', () => {
    const email = buildEmailChangedEmail(
      'en',
      'old@example.com',
      'new@example.com',
      loginUrl,
    );

    expect(email.subject).toBe('Your sign-in address was changed');
    expect(email.text).toContain('from old@example.com to new@example.com');
    expect(email.text).toContain('If it was not you who changed the address');
  });

  it.each(['it', 'en'] as const)(
    'escapes an address in the HTML body: it was typed by somebody (%s)',
    (language) => {
      const email = buildEmailChangedEmail(
        language,
        'a@example.com',
        "o'<script>@example.com",
        loginUrl,
      );

      expect(email.html).not.toContain('<script>');
      expect(email.html).toContain('&lt;script&gt;');
      // The plain-text part is not HTML: the address is shown as it is.
      expect(email.text).toContain("o'<script>@example.com");
    },
  );
});
