import it from './locales/it.json';
import en from './locales/en.json';

const dictionaries = { it, en } as const;
// The language every dictionary is complete in: the last stop of every
// fallback, whatever the site or the page speaks.
const LAST_RESORT = 'en';

export type TranslationKey = keyof typeof it;

/**
 * Whether core's dictionary has this key: for a label that arrives as a
 * plain string — a block descriptor's — and has to be checked before it
 * is looked up, rather than asserted to be a key.
 */
export function isTranslationKey(key: string): key is TranslationKey {
  return key in it;
}

/**
 * One language's strings, by key — what a `locales.json` holds for each
 * of its languages.
 */
export type Dictionary<Key extends string = string> = Readonly<
  Record<Key, string>
>;

/** A locale and the language it is a variety of: 'en-GB' is ['en-GB', 'en']. */
function withBaseLanguage(locale: string): string[] {
  const language = locale.split('-')[0] ?? locale;
  return language === locale ? [locale] : [locale, language];
}

/**
 * Strings for one locale, out of a set of dictionaries by language — the
 * shape of a theme's own `locales.json` (`{ "en": {...}, "it": {...} }`)
 * as much as of core's.
 *
 * `locale` can be any string a site enables (LocaleSettings has no fixed
 * list), and a dictionary has only the languages somebody wrote. A string is
 * looked for, in order, in: the locale, its base language ('en-US' -> 'en'),
 * the site's own language (`siteDefaultLocale`, the one its pages are
 * written in, and the one a visitor in a language nobody translated is most
 * likely to read), and English. A key no dictionary has comes back as itself.
 * It never throws on a locale it has nothing for.
 *
 * A theme keeps its own UI copy this way (docs/adr/0089): it cannot add
 * keys to core's dictionary, which lives in this package, and a theme that
 * lives in its own repository could not reach it at all.
 */
export class DictionaryTranslator<Key extends string> {
  /**
   * The language the strings come out in: the first of the chain that this
   * dictionary has. A widget that is not drawn by this class and speaks only
   * some languages (the captcha's) is told this one, so that it says its
   * words in the language the rest of the page does.
   */
  readonly language: string | undefined;

  private readonly dicts: readonly Partial<Dictionary<Key>>[];

  constructor(
    private readonly locale: string,
    dictionaries: Readonly<Record<string, Dictionary<Key>>>,
    private readonly siteDefaultLocale?: string,
  ) {
    const spoken = [
      ...withBaseLanguage(locale),
      ...(siteDefaultLocale ? withBaseLanguage(siteDefaultLocale) : []),
      LAST_RESORT,
    ].filter((candidate) => dictionaries[candidate] !== undefined);
    this.language = spoken[0];
    this.dicts = spoken
      .map((candidate) => dictionaries[candidate])
      .filter((dict): dict is Dictionary<Key> => dict !== undefined);
  }

  /**
   * A theme's own dictionaries, resolved the way these are: the same
   * locale and the same site language. A theme that built its own with
   * `new DictionaryTranslator(locale, strings)` would leave the site's
   * language out, and say its words in a different one than core does.
   */
  withDictionaries<OtherKey extends string>(
    dictionaries: Readonly<Record<string, Dictionary<OtherKey>>>,
  ): DictionaryTranslator<OtherKey> {
    return new DictionaryTranslator(
      this.locale,
      dictionaries,
      this.siteDefaultLocale,
    );
  }

  t(key: Key, vars?: Record<string, string | number>): string {
    let value: string = key;
    for (const dict of this.dicts) {
      const found = dict[key];
      if (found !== undefined) {
        value = found;
        break;
      }
    }
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  }
}

// UI-chrome strings for the ~18 "service" blocks (Countdown, Form,
// SearchBox, ...) that render regardless of a page's own content —
// unrelated to Block content translation (docs/adr/0017), which is
// per-page data, not per-locale UI copy. An instance, not a bare exported
// function — resolves the dictionary once at construction instead of on
// every call, same collaborator-over-free-function shape as the rest of this
// codebase. The public site builds ONE per rendered block, from the page's
// locale and the site's own language, and hands it down as `i18n`: a
// component that built its own from the locale alone would leave out the
// second of those.
export class Translator extends DictionaryTranslator<TranslationKey> {
  constructor(locale: string, siteDefaultLocale?: string) {
    super(locale, dictionaries, siteDefaultLocale);
  }
}
