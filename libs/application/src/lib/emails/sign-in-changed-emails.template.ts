import type { EmailMessage } from '@kometio/ports';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { ctaButtonHtml, escapeHtml, renderEmailLayout } from './email-layout';

interface Copy {
  passwordSubject: string;
  passwordChanged: string;
  passwordWarning: string;
  addressSubject: string;
  /** Where the account's address went from and to: typed by somebody, so the caller escapes it for HTML. */
  addressChanged: (oldEmail: string, newEmail: string) => string;
  addressWarning: string;
  cta: string;
}

const COPY: Record<InterfaceLanguage, Copy> = {
  it: {
    passwordSubject: 'La tua password è stata cambiata',
    passwordChanged:
      'La password del tuo account Kometio è stata appena cambiata, e ogni altro accesso è stato chiuso.',
    passwordWarning:
      'Se non sei stato tu a cambiare la password, reimposta subito la password dalla pagina di accesso ("Password dimenticata?") e avvisa un amministratore.',
    addressSubject: 'Il tuo indirizzo di accesso è stato cambiato',
    addressChanged: (oldEmail, newEmail) =>
      `L'indirizzo con cui accedi al tuo account Kometio è stato cambiato da ${oldEmail} a ${newEmail}. D'ora in poi le comunicazioni andranno al nuovo indirizzo.`,
    addressWarning:
      'Se non sei stato tu a cambiare l\'indirizzo, reimposta subito la password dalla pagina di accesso ("Password dimenticata?") e avvisa un amministratore.',
    cta: 'Vai alla pagina di accesso',
  },
  en: {
    passwordSubject: 'Your password was changed',
    passwordChanged:
      'The password of your Kometio account has just been changed, and every other session has been signed out.',
    passwordWarning:
      'If it was not you who changed the password, reset it right away from the sign-in page ("Forgot your password?") and tell an administrator.',
    addressSubject: 'Your sign-in address was changed',
    addressChanged: (oldEmail, newEmail) =>
      `The address you sign in to your Kometio account with was changed from ${oldEmail} to ${newEmail}. From now on, messages will go to the new address.`,
    addressWarning:
      'If it was not you who changed the address, reset your password right away from the sign-in page ("Forgot your password?") and tell an administrator.',
    cta: 'Go to the sign-in page',
  },
};

/**
 * Sent to the account's own address after its password was changed: the one
 * message that lets the real owner find out somebody else did it.
 */
export function buildPasswordChangedEmail(
  language: InterfaceLanguage,
  loginUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.passwordChanged}</p>
     <p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.passwordWarning}</p>
     ${ctaButtonHtml(loginUrl, copy.cta)}`,
  );
  const text = `${copy.passwordChanged}\n\n${copy.passwordWarning}\n\n${loginUrl}`;
  return { subject: copy.passwordSubject, html, text };
}

/**
 * Sent to the address an account is LEAVING, once the change has been
 * confirmed: from now on everything goes to the new one, and this is the
 * last the old one hears of it.
 */
export function buildEmailChangedEmail(
  language: InterfaceLanguage,
  oldEmail: string,
  newEmail: string,
  loginUrl: string,
): Omit<EmailMessage, 'to'> {
  const copy = COPY[language];
  const html = renderEmailLayout(
    language,
    `<p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.addressChanged(escapeHtml(oldEmail), escapeHtml(newEmail))}</p>
     <p style="margin:0 0 16px;color:#374151;font-size:14px;">${copy.addressWarning}</p>
     ${ctaButtonHtml(loginUrl, copy.cta)}`,
  );
  const text = `${copy.addressChanged(oldEmail, newEmail)}\n\n${copy.addressWarning}\n\n${loginUrl}`;
  return { subject: copy.addressSubject, html, text };
}
