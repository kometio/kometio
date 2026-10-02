import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { ctaButtonHtml, renderEmailLayout } from './email-layout';

const COPY: Record<
  InterfaceLanguage,
  {
    subject: string;
    intro: string;
    action: string;
    cta: string;
    expiry: string;
  }
> = {
  it: {
    subject: 'Sei stato invitato su Kometio',
    intro: 'Un amministratore ti ha invitato a collaborare su Kometio.',
    action: 'Imposta la tua password per accedere.',
    cta: "Accetta l'invito",
    expiry: 'Il link scade tra 7 giorni.',
  },
  en: {
    subject: 'You have been invited to Kometio',
    intro: 'An administrator has invited you to collaborate on Kometio.',
    action: 'Set your password to sign in.',
    cta: 'Accept the invitation',
    expiry: 'The link expires in 7 days.',
  },
};

export function buildInviteEmail(
  language: InterfaceLanguage,
  inviteUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.intro} ${copy.action}</p>
     ${ctaButtonHtml(inviteUrl, copy.cta)}
     <p style="margin-top:16px;color:#6b7280;font-size:12px;">${copy.expiry}</p>`,
  );
  const text = `${copy.intro}\n\n${inviteUrl}\n\n${copy.expiry}`;

  return { subject: copy.subject, html, text };
}
