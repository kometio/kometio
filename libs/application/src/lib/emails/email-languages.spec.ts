import { describe, expect, it } from 'vitest';
import { INTERFACE_LANGUAGES } from '@kometio/shared-types';
import { buildEmailChangeEmail } from './email-change-email.template';
import { buildFormSubmissionNotificationEmail } from './form-submission-notification-email.template';
import { buildInviteEmail } from './invite-email.template';
import { buildPasswordResetEmail } from './password-reset-email.template';
import {
  buildEmailChangedEmail,
  buildPasswordChangedEmail,
} from './sign-in-changed-emails.template';
import { buildVerificationEmail } from './verification-email.template';

const url = 'https://editor.example.com/somewhere?token=abc';

/** Every email the system sends, each as a function of the language. */
const EMAILS = {
  verification: (language) => buildVerificationEmail(language, url),
  passwordReset: (language) => buildPasswordResetEmail(language, url),
  invite: (language) => buildInviteEmail(language, url),
  emailChange: (language) => buildEmailChangeEmail(language, url),
  passwordChanged: (language) => buildPasswordChangedEmail(language, url),
  emailChanged: (language) =>
    buildEmailChangedEmail(language, 'old@example.com', 'new@example.com', url),
  formSubmission: (language) =>
    buildFormSubmissionNotificationEmail(language, 'Contact', [
      { label: 'Email', value: 'visitor@example.com' },
    ]),
} satisfies Record<
  string,
  (language: (typeof INTERFACE_LANGUAGES)[number]) => {
    subject: string;
    html: string;
    text: string;
  }
>;

describe.each(Object.entries(EMAILS))('the %s email', (_name, build) => {
  it.each(INTERFACE_LANGUAGES)('is complete in %s', (language) => {
    const email = build(language);

    expect(email.subject.trim()).not.toBe('');
    expect(email.text.trim()).not.toBe('');
    // Declared in the page, so a screen reader reads it in its own language.
    expect(email.html).toContain(`lang="${language}"`);
  });

  it('is not the same message in two languages', () => {
    const subjects = INTERFACE_LANGUAGES.map(
      (language) => build(language).subject,
    );
    const bodies = INTERFACE_LANGUAGES.map((language) => build(language).text);

    expect(new Set(subjects).size).toBe(INTERFACE_LANGUAGES.length);
    expect(new Set(bodies).size).toBe(INTERFACE_LANGUAGES.length);
  });
});
