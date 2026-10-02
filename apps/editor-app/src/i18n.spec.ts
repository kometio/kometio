import { afterEach, describe, expect, it } from 'vitest';
import i18next from './i18n';

describe('i18n', () => {
  afterEach(async () => {
    await i18next.changeLanguage('it');
  });

  // A screen reader picks its voice from it, and the browser its
  // hyphenation rules.
  it('keeps the page language the editor language', async () => {
    await i18next.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    await i18next.changeLanguage('it');
    expect(document.documentElement.lang).toBe('it');
  });
});
