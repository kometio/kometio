import { describe, expect, it } from 'vitest';
import { shownTranslation } from './shown-translation';

const of = (...locales: string[]) => locales.map((locale) => ({ locale }));

describe('shownTranslation', () => {
  it('is the site’s default language when the page has it, wherever it comes', () => {
    expect(shownTranslation(of('de', 'en', 'it'), 'it')).toEqual({
      locale: 'it',
    });
    expect(shownTranslation(of('it', 'de'), 'it')).toEqual({ locale: 'it' });
  });

  it('is the first by code when the page has not the default, whatever order they arrive in', () => {
    expect(shownTranslation(of('it', 'en', 'de'), 'fr')).toEqual({
      locale: 'de',
    });
    expect(shownTranslation(of('de', 'en'), 'fr')).toEqual({ locale: 'de' });
  });

  it('is nothing for a page with no translation at all', () => {
    expect(shownTranslation([], 'it')).toBeUndefined();
  });

  it('is the element given, not a copy, so that what is read off it is the row’s own', () => {
    const translations = [{ locale: 'en', title: 'About' }];

    expect(shownTranslation(translations, 'it')).toBe(translations[0]);
  });
});
