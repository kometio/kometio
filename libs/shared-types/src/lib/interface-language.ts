import { z } from 'zod';

/**
 * The languages Kometio itself speaks: the editor, and every email it sends a
 * person. Not the languages a site is published in — those are the site's own
 * (`enabledLocales`) and can be any. A third language here is a locale file
 * for the editor and a block of copy in each email template; the compiler
 * lists the templates that lack it.
 */
export const INTERFACE_LANGUAGES = ['it', 'en'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

export const interfaceLanguageSchema = z.enum(INTERFACE_LANGUAGES);

export function isInterfaceLanguage(value: string): value is InterfaceLanguage {
  return INTERFACE_LANGUAGES.some((language) => language === value);
}

/** The interface language a locale tag maps to — `it-IT` is Italian — or `null` for one Kometio does not speak (`fr`). */
export function interfaceLanguageOfLocale(
  locale: string,
): InterfaceLanguage | null {
  const base = locale.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return isInterfaceLanguage(base) ? base : null;
}
