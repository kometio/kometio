import it from './locales/it.json';
import en from './locales/en.json';

const dictionaries = { it, en } as const;
const DEFAULT_LOCALE = 'it';

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

/**
 * Strings for one locale, out of a set of dictionaries by language — the
 * shape of a theme's own `locales.json` (`{ "en": {...}, "it": {...} }`)
 * as much as of core's.
 *
 * `locale` can be any string a site enables (LocaleSettings has no fixed
 * list): it falls back to the base language subtag ('en-US' -> 'en'), then
 * to Italian, then to English, and a key no dictionary has comes back as
 * itself. It never throws on a locale it has nothing for.
 *
 * A theme keeps its own UI copy this way (docs/adr/0089): it cannot add
 * keys to core's dictionary, which lives in this package, and a theme that
 * lives in its own repository could not reach it at all.
 */
export class DictionaryTranslator<Key extends string> {
  private readonly dicts: readonly Partial<Dictionary<Key>>[];

  constructor(
    locale: string,
    dictionaries: Readonly<Record<string, Dictionary<Key>>>,
  ) {
    const lang = locale.split('-')[0] ?? locale;
    this.dicts = [locale, lang, DEFAULT_LOCALE, 'en']
      .map((candidate) => dictionaries[candidate])
      .filter((dict): dict is Dictionary<Key> => dict !== undefined);
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
// per-page data, not per-locale UI copy. One instance per rendering
// component (`new Translator(locale)`), not a bare exported function —
// resolves the dictionary once at construction instead of on every call,
// same collaborator-over-free-function shape as the rest of this codebase.
export class Translator extends DictionaryTranslator<TranslationKey> {
  constructor(locale: string) {
    super(locale, dictionaries);
  }
}
