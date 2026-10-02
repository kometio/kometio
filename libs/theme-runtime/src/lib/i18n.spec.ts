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
    ).toBe('Passo 2 di 4');
  });

  it('falls back to the base language subtag (en-US -> en)', () => {
    expect(new Translator('en-US').t('form.submit')).toBe('Submit');
  });

  it('falls back to Italian for a locale with no dictionary of its own', () => {
    expect(new Translator('fr').t('form.submit')).toBe('Invia');
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

  it('falls back to Italian, then English, for a language the theme does not speak', () => {
    expect(new DictionaryTranslator('fr', themeStrings).t('sidebarLabel')).toBe(
      'Documentazione',
    );
    expect(
      new DictionaryTranslator('fr', { en: themeStrings.en }).t('sidebarLabel'),
    ).toBe('Documentation');
  });

  it('gives back the key itself when no dictionary has it', () => {
    const partial: Record<string, Record<'a' | 'b', string>> = {
      en: { a: 'A', b: 'B' },
    };
    expect(new DictionaryTranslator('en', partial).t('a')).toBe('A');
    expect(new DictionaryTranslator('de', {}).t('missing')).toBe('missing');
  });
});
