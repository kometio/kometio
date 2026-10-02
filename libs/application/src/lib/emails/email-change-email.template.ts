import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { ctaButtonHtml, renderEmailLayout } from './email-layout';

const COPY: Record<
  InterfaceLanguage,
  { subject: string; intro: string; cta: string; expiry: string }
> = {
  it: {
    subject: 'Conferma il tuo nuovo indirizzo email',
    intro:
      'Hai chiesto di usare questo indirizzo per accedere al tuo account Kometio. Conferma che è tuo per completare il cambio.',
    cta: 'Conferma il nuovo indirizzo',
    expiry:
      "Il link scade tra 24 ore. Se non hai chiesto tu il cambio, ignora questo messaggio: l'indirizzo dell'account resta quello di prima.",
  },
  en: {
    subject: 'Confirm your new email address',
    intro:
      'You asked to use this address to sign in to your Kometio account. Confirm that it is yours to complete the change.',
    cta: 'Confirm the new address',
    expiry:
      'The link expires in 24 hours. If you did not ask for the change, ignore this message: the address of the account stays as it was.',
  },
};

export function buildEmailChangeEmail(
  language: InterfaceLanguage,
  confirmUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.intro}</p>
     ${ctaButtonHtml(confirmUrl, copy.cta)}
     <p style="margin-top:16px;color:#6b7280;font-size:12px;">${copy.expiry}</p>`,
  );
  const text = `${copy.intro}\n\n${confirmUrl}\n\n${copy.expiry}`;

  return { subject: copy.subject, html, text };
}
