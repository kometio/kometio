import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { escapeHtml, renderEmailLayout } from './email-layout';

export interface FormSubmissionEntry {
  label: string;
  value: string;
}

const COPY: Record<
  InterfaceLanguage,
  {
    subject: (formName: string) => string;
    /** The sentence that names the form: the caller escapes the name for HTML, or passes it as typed for the plain-text part. */
    intro: (formName: string) => string;
  }
> = {
  it: {
    subject: (formName) => `Nuova risposta al modulo "${formName}"`,
    intro: (formName) =>
      `Hai ricevuto una nuova risposta al modulo ${formName}.`,
  },
  en: {
    subject: (formName) => `New response to the form "${formName}"`,
    intro: (formName) =>
      `You have received a new response to the form ${formName}.`,
  },
};

export function buildFormSubmissionNotificationEmail(
  language: InterfaceLanguage,
  formName: string,
  entries: FormSubmissionEntry[],
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const rowsHtml = entries
    .map(
      (entry) =>
        `<p style="margin:0 0 12px;color:#374151;font-size:14px;"><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</p>`,
    )
    .join('');
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.intro(`<strong>${escapeHtml(formName)}</strong>`)}</p>
     ${rowsHtml}`,
  );
  const text = `${copy.intro(`"${formName}"`)}\n\n${entries.map((entry) => `${entry.label}: ${entry.value}`).join('\n')}`;

  return { subject: copy.subject(formName), html, text };
}
