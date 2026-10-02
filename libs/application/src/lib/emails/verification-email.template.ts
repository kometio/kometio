import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { ctaButtonHtml, renderEmailLayout } from './email-layout';

const COPY: Record<
  InterfaceLanguage,
  { subject: string; intro: string; cta: string; expiry: string }
> = {
  it: {
    subject: 'Verifica il tuo indirizzo email',
    intro:
      'Conferma il tuo indirizzo email per completare la configurazione del tuo account Kometio.',
    cta: 'Verifica la tua email',
    expiry: 'Il link scade tra 24 ore.',
  },
  en: {
    subject: 'Verify your email address',
    intro:
      'Confirm your email address to finish setting up your Kometio account.',
    cta: 'Verify your email',
    expiry: 'The link expires in 24 hours.',
  },
};

export function buildVerificationEmail(
  language: InterfaceLanguage,
  verifyUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.intro}</p>
     ${ctaButtonHtml(verifyUrl, copy.cta)}
     <p style="margin-top:16px;color:#6b7280;font-size:12px;">${copy.expiry}</p>`,
  );
  const text = `${copy.intro}\n\n${verifyUrl}\n\n${copy.expiry}`;

  return { subject: copy.subject, html, text };
}
