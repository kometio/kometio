/**
 * Curated BCP-47 language-region tags offered in the site locale picker
 * (`LocaleListEditor`) — not exhaustive (there is no attempt to cover
 * every real-world combination), and NOT enforced by `localeSettingsSchema`
 * (see that file's own comment: an agency's own naming convention for a
 * locale code is theirs to pick, not this editor's to constrain) — this is
 * only the vetted set surfaced in the UI so a new site's locales are
 * well-formed by default. A site that already has a non-standard code
 * stored keeps working unchanged; it just won't appear pre-selected here.
 *
 * Display names are derived from `Intl.DisplayNames` at render time
 * (`getLocaleDisplayName` below), never hardcoded — so they can't drift
 * from what the runtime itself calls each language, and adding a new code
 * here never requires also writing its name by hand.
 */
export const CURATED_LOCALE_CODES = [
  'ar-SA',
  'ar-EG',
  'ar-AE',
  'bg-BG',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'de-AT',
  'de-CH',
  'el-GR',
  'en-US',
  'en-GB',
  'en-AU',
  'en-CA',
  'en-IE',
  'en-NZ',
  'en-ZA',
  'en-IN',
  'es-ES',
  'es-MX',
  'es-AR',
  'es-CO',
  'es-CL',
  'es-US',
  'fa-IR',
  'fi-FI',
  'fr-FR',
  'fr-CA',
  'fr-BE',
  'fr-CH',
  'he-IL',
  'hi-IN',
  'hr-HR',
  'hu-HU',
  'id-ID',
  'it-IT',
  'it-CH',
  'ja-JP',
  'ko-KR',
  'lt-LT',
  'lv-LV',
  'nb-NO',
  'nl-NL',
  'nl-BE',
  'pl-PL',
  'pt-PT',
  'pt-BR',
  'ro-RO',
  'ru-RU',
  'sk-SK',
  'sl-SI',
  'sr-RS',
  'sv-SE',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'ur-PK',
  'vi-VN',
  'zh-CN',
  'zh-TW',
  'zh-HK',
] as const;

export type CuratedLocaleCode = (typeof CURATED_LOCALE_CODES)[number];

/**
 * `inLocale` is which language the NAME itself is rendered in (the app
 * chrome's own current UI language), not the locale being named — asking
 * for `getLocaleDisplayName('it-IT', 'en')` returns "Italian (Italy)",
 * `getLocaleDisplayName('it-IT', 'it')` returns "italiano (Italia)".
 * `Intl.DisplayNames` throws on a handful of malformed tags rather than
 * returning undefined; every code in CURATED_LOCALE_CODES is well-formed
 * so that path is only a safety net for a locale a site already had stored
 * outside the curated list before this picker existed.
 */
export function getLocaleDisplayName(code: string, inLocale = 'en'): string {
  try {
    return (
      new Intl.DisplayNames([inLocale], { type: 'language' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}
