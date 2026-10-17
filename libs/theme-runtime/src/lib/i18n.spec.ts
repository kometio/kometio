import { describe, expect, it } from 'vitest';
import { DictionaryTranslator, Translator } from './i18n';

describe('Translator', () => {
  it('returns the Italian string for a known key and locale', () => {
    expect(new Translator('it').t('form.submit')).toBe('Invia');
  });

  it('returns the English string for a known key and locale', () => {
    expect(new Translator('en').t('form.submit')).toBe('Submit');
  });

  it('substitutes {var} placeholders', () => {
    expect(
      new Translator('it').t('form.stepIndicator', { current: 2, total: 4 }),
    ).toBe('Passaggio 2 di 4');
  });

  it('falls back to the base language subtag (en-US -> en)', () => {
    expect(new Translator('en-US').t('form.submit')).toBe('Submit');
  });

  describe('for a language it has no dictionary of', () => {
    it("falls back to the site's own language when it has one", () => {
      expect(new Translator('fr', 'it').t('form.submit')).toBe('Invia');
      expect(new Translator('fr', 'en').t('form.submit')).toBe('Submit');
    });

    it("reads the site's language by its base subtag too (en-GB -> en)", () => {
      expect(new Translator('fr', 'en-GB').t('form.submit')).toBe('Submit');
    });

    it("falls back to English when the site's own language has no dictionary either", () => {
      expect(new Translator('fr', 'de').t('form.submit')).toBe('Submit');
    });

    it('falls back to English when there is no site to ask', () => {
      expect(new Translator('fr').t('form.submit')).toBe('Submit');
    });

    it('prefers the language of the page to the language of the site', () => {
      expect(new Translator('it', 'en').t('form.submit')).toBe('Invia');
    });
  });

  describe('language', () => {
    it('is the language the strings come out in', () => {
      expect(new Translator('it').language).toBe('it');
      expect(new Translator('en-GB').language).toBe('en');
      expect(new Translator('fr', 'it').language).toBe('it');
      expect(new Translator('fr', 'de').language).toBe('en');
      expect(new Translator('fr').language).toBe('en');
    });
  });
});

describe('DictionaryTranslator', () => {
  // A theme's own locales.json, as its regions import it.
  const themeStrings = {
    en: { sidebarLabel: 'Documentation', pageOf: 'Page {current} of {total}' },
    it: {
      sidebarLabel: 'Documentazione',
      pageOf: 'Pagina {current} di {total}',
    },
  };

  it("reads a theme's own strings in the page's language", () => {
    expect(new DictionaryTranslator('it', themeStrings).t('sidebarLabel')).toBe(
      'Documentazione',
    );
    expect(
      new DictionaryTranslator('en-GB', themeStrings).t('pageOf', {
        current: 2,
        total: 5,
      }),
    ).toBe('Page 2 of 5');
  });

  it("falls back to the site's language, then English, for a language the theme does not speak", () => {
    expect(
      new DictionaryTranslator('fr', themeStrings, 'it').t('sidebarLabel'),
    ).toBe('Documentazione');
    expect(
      new DictionaryTranslator('fr', themeStrings, 'de').t('sidebarLabel'),
    ).toBe('Documentation');
    expect(new DictionaryTranslator('fr', themeStrings).t('sidebarLabel')).toBe(
      'Documentation',
    );
    expect(
      new DictionaryTranslator('fr', { en: themeStrings.en }, 'it').t(
        'sidebarLabel',
      ),
    ).toBe('Documentation');
  });

  it("is bound to a Translator's language and site by `withDictionaries`, so the theme's strings and core's cannot disagree", () => {
    const core = new Translator('fr', 'it');

    expect(core.withDictionaries(themeStrings).t('sidebarLabel')).toBe(
      'Documentazione',
    );
    expect(core.withDictionaries(themeStrings).language).toBe(core.language);
    expect(
      new Translator('en-GB', 'it')
        .withDictionaries(themeStrings)
        .t('pageOf', { current: 1, total: 3 }),
    ).toBe('Page 1 of 3');
  });

  it('gives back the key itself when no dictionary has it', () => {
    const partial: Record<string, Record<'a' | 'b', string>> = {
      en: { a: 'A', b: 'B' },
    };
    expect(new DictionaryTranslator('en', partial).t('a')).toBe('A');
    expect(new DictionaryTranslator('de', {}).t('missing')).toBe('missing');
  });
});
