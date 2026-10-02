import { describe, expect, it } from 'vitest';
import { buildFormSubmissionNotificationEmail } from './form-submission-notification-email.template';

describe('buildFormSubmissionNotificationEmail', () => {
  it('includes the form name and field entries in both bodies', () => {
    const email = buildFormSubmissionNotificationEmail('it', 'Contatti', [
      { label: 'Email', value: 'visitor@example.com' },
      { label: 'Note', value: 'Ciao!' },
    ]);

    expect(email.subject).toBe('Nuova risposta al modulo "Contatti"');
    expect(email.html).toContain('visitor@example.com');
    expect(email.html).toContain('Ciao!');
    expect(email.text).toContain(
      'Hai ricevuto una nuova risposta al modulo "Contatti".',
    );
    expect(email.text).toContain('visitor@example.com');
    expect(email.text).toContain('Ciao!');
  });

  it('is written in English for a site whose language is English', () => {
    const email = buildFormSubmissionNotificationEmail('en', 'Contact', [
      { label: 'Email', value: 'visitor@example.com' },
    ]);

    expect(email.subject).toBe('New response to the form "Contact"');
    expect(email.html).toContain(
      'You have received a new response to the form <strong>Contact</strong>.',
    );
    expect(email.text).toContain(
      'You have received a new response to the form "Contact".',
    );
    expect(email.text).toContain('Email: visitor@example.com');
  });

  it('escapes HTML in submitted values to prevent markup injection', () => {
    const email = buildFormSubmissionNotificationEmail('it', 'Contatti', [
      { label: 'Note', value: '<img src=x onerror=alert(1)>' },
    ]);

    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the form name in the HTML body: it was typed by somebody', () => {
    const email = buildFormSubmissionNotificationEmail('en', '<b>Hi</b>', []);

    expect(email.html).not.toContain('<b>Hi</b>');
    expect(email.html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
  });
});
