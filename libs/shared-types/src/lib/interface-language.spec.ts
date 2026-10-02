import { describe, expect, it } from 'vitest';
import {
  INTERFACE_LANGUAGES,
  interfaceLanguageOfLocale,
  interfaceLanguageSchema,
  isInterfaceLanguage,
} from './interface-language';

describe('interface languages', () => {
  it('are the ones Kometio is written in', () => {
    expect([...INTERFACE_LANGUAGES]).toEqual(['it', 'en']);
  });

  it('recognises a language by its exact code only', () => {
    expect(isInterfaceLanguage('it')).toBe(true);
    expect(isInterfaceLanguage('IT')).toBe(false);
    expect(isInterfaceLanguage('fr')).toBe(false);
    expect(interfaceLanguageSchema.safeParse('en').success).toBe(true);
    expect(interfaceLanguageSchema.safeParse('it-IT').success).toBe(false);
  });

  it('maps a locale tag to its language, and a locale Kometio does not speak to nothing', () => {
    expect(interfaceLanguageOfLocale('it')).toBe('it');
    expect(interfaceLanguageOfLocale('it-IT')).toBe('it');
    expect(interfaceLanguageOfLocale('EN_gb')).toBe('en');
    expect(interfaceLanguageOfLocale('fr')).toBeNull();
    expect(interfaceLanguageOfLocale('')).toBeNull();
  });
});
