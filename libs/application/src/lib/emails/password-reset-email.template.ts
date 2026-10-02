import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { ctaButtonHtml, renderEmailLayout } from './email-layout';

const COPY: Record<
  InterfaceLanguage,
  { subject: string; intro: string; cta: string; expiry: string }
> = {
  it: {
    subject: 'Reimposta la tua password',
    intro:
      'Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account Kometio.',
    cta: 'Reimposta la password',
    expiry:
      'Il link scade tra 1 ora. Reimpostando la password verranno terminate tutte le sessioni attive.',
  },
  en: {
    subject: 'Reset your password',
    intro:
      'We received a request to reset the password of your Kometio account.',
    cta: 'Reset your password',
    expiry:
      'The link expires in 1 hour. Resetting the password ends every active session.',
  },
};

export function buildPasswordResetEmail(
  language: InterfaceLanguage,
  resetUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.intro}</p>
     ${ctaButtonHtml(resetUrl, copy.cta)}
     <p style="margin-top:16px;color:#6b7280;font-size:12px;">${copy.expiry}</p>`,
  );
  const text = `${copy.intro}\n\n${resetUrl}\n\n${copy.expiry}`;

  return { subject: copy.subject, html, text };
}
