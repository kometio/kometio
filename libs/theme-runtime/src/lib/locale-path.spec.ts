import { describe, expect, it } from 'vitest';
import { localeDirection, localePath } from './locale-path';

describe('localePath', () => {
  it('maps the "home" slug to the bare locale root', () => {
    expect(localePath('it', 'home')).toBe('/it/');
  });

  it('maps any other slug to a locale-prefixed path', () => {
    expect(localePath('en', 'about-us')).toBe('/en/about-us');
  });
});

describe('localeDirection', () => {
  it('returns rtl for known RTL languages, with or without a region subtag', () => {
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('he')).toBe('rtl');
    expect(localeDirection('fa')).toBe('rtl');
    expect(localeDirection('ur')).toBe('rtl');
    expect(localeDirection('ar-SA')).toBe('rtl');
  });

  it('is case-insensitive', () => {
    expect(localeDirection('AR')).toBe('rtl');
  });

  it('returns ltr for anything else', () => {
    expect(localeDirection('it')).toBe('ltr');
    expect(localeDirection('en-US')).toBe('ltr');
  });
});
