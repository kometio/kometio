import {
  INTERFACE_LANGUAGES,
  type InterfaceLanguage,
} from '@kometio/shared-types';

/**
 * Each language in its own tongue: a person who cannot read the current
 * language has to be able to find theirs, so the names are not translated.
 * A record over the languages the API knows (`INTERFACE_LANGUAGES`), so a
 * third language cannot be added there and forgotten here.
 */
const LANGUAGE_NAMES: Record<InterfaceLanguage, string> = {
  it: 'Italiano',
  en: 'English',
};

/**
 * The languages the editor — and the emails — are written in. A third one is
 * a name above, a locale file and a set of email templates; the controls that
 * offer them are selects precisely so they do not stop working the day there
 * is one (the switch they replaced knew two).
 */
export const UI_LANGUAGES = INTERFACE_LANGUAGES.map((value) => ({
  value,
  label: LANGUAGE_NAMES[value],
}));
