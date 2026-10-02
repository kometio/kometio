import type { DeploymentLocalePort } from '@kometio/ports';
import {
  interfaceLanguageOfLocale,
  type InterfaceLanguage,
} from '@kometio/shared-types';

/** The last resort: a site in a language no email is written in, or none at all. */
const FALLBACK_LANGUAGE: InterfaceLanguage = 'en';

export interface EmailLanguageDeps {
  deploymentLocale: DeploymentLocalePort;
}

/**
 * The language of an email that belongs to no account: a form's
 * notification goes to an address somebody typed, and the only thing that
 * says how to write to them is the site's own default language.
 */
export async function emailLanguageOfSite(
  deps: EmailLanguageDeps,
  tenantId: string,
): Promise<InterfaceLanguage> {
  const locale = await deps.deploymentLocale.defaultLocale(tenantId);
  return (locale && interfaceLanguageOfLocale(locale)) || FALLBACK_LANGUAGE;
}

/**
 * The language to write to a person in (docs/adr/0100): the one they chose,
 * and for somebody who has not — an invitee nobody picked a language for, an
 * account older than the choice — the language of the site.
 *
 * Asked only when the person has no language of their own: a mail to
 * somebody who chose costs no lookup, and cannot be held up by one.
 */
export async function emailLanguageOfUser(
  deps: EmailLanguageDeps,
  user: {
    readonly tenantId: string;
    readonly language: InterfaceLanguage | null;
  },
): Promise<InterfaceLanguage> {
  return user.language ?? emailLanguageOfSite(deps, user.tenantId);
}
