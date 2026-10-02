import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance, type i18n } from 'i18next';
import { z } from 'zod';

/** The editor's own words, one JSON file per language. */
const LOCALES_DIR = resolve(
  import.meta.dirname,
  '../../../editor-app/src/locales',
);

const localeSchema = z.record(z.string(), z.unknown());

function readLocale(language: string) {
  return localeSchema.parse(
    JSON.parse(readFileSync(resolve(LOCALES_DIR, `${language}.json`), 'utf8')),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Stands where a value a test cannot know goes, until the sentence is turned into a pattern. */
const MARK = '\u0000';

/**
 * The editor's words in the language it is showing, so a test names a
 * button by the key of its text and not by the text.
 *
 * The editor speaks the language saved on the account of whoever is signed
 * in (ADR-0100), and English until then, so the suite takes the language from
 * the account and reads the same files the editor does, with the same
 * fallback to English. A test then passes whatever language a developer's
 * account has, and a button whose text was renamed or translated cannot
 * leave a test looking for the old words. What it does not move is the
 * sign-in form: it is drawn before there is an account, always in English.
 */
export class EditorCopy {
  private constructor(private readonly translator: i18n) {}

  static async load(language: string): Promise<EditorCopy> {
    const translator = createInstance();
    await translator.init({
      lng: language,
      fallbackLng: 'en',
      resources: {
        en: { translation: readLocale('en') },
        [language]: { translation: readLocale(language) },
      },
      interpolation: { escapeValue: false },
    });
    return new EditorCopy(translator);
  }

  /** The text of a key. A key the editor does not have, or a value it needs and was not given, is an error here, not a text nobody finds. */
  t(key: string, values: Record<string, string | number> = {}): string {
    if (!this.translator.exists(key)) {
      throw new Error(
        `The editor has no text "${key}" (apps/editor-app/src/locales)`,
      );
    }
    const text = this.translator.t(key, values);
    const unfilled = /\{\{\s*(\w+)\s*\}\}/.exec(text);
    if (unfilled) {
      throw new Error(`"${key}" needs a value for "${unfilled[1]}"`);
    }
    return text;
  }

  /**
   * A pattern for the text of a key, for a text with a part the test cannot
   * know (a time, the name of a block): that value is given as a pattern
   * itself, and every other one as what it is. It matches anywhere in the
   * name it is tested against, as a string does for a locator.
   */
  pattern(
    key: string,
    values: Record<string, RegExp | string | number> = {},
  ): RegExp {
    const open = new Map<string, RegExp>();
    const known: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(values)) {
      if (value instanceof RegExp) {
        open.set(name, value);
        known[name] = `${MARK}${name}${MARK}`;
      } else {
        known[name] = value;
      }
    }
    const source = this.t(key, known)
      .split(new RegExp(`${MARK}(\\w+)${MARK}`))
      .map((part, index) => {
        if (index % 2 === 0) return escapeRegExp(part);
        const pattern = open.get(part);
        if (!pattern) throw new Error(`No pattern was given for "${part}"`);
        return `(?:${pattern.source})`;
      })
      .join('');
    return new RegExp(source);
  }
}
