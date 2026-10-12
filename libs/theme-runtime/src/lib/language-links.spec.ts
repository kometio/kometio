import { describe, expect, it } from 'vitest';
import { languageLinks, type LanguageLinkSite } from './language-links';

const site = (overrides: Partial<LanguageLinkSite> = {}): LanguageLinkSite => ({
  defaultLocale: 'it',
  enabledLocales: ['it', 'en'],
  untranslatedPageFallback: 'not-available',
  ...overrides,
});

const page = (locale: string, slug: string, ancestorSlugs: string[] = []) => ({
  locale,
  slug,
  ancestorSlugs,
});

describe('languageLinks', () => {
  it('links each enabled locale to its own translation, in the order the site enables them', () => {
    expect(
      languageLinks(site({ enabledLocales: ['en', 'it'] }), [
        page('it', 'chi-siamo'),
        page('en', 'about-us'),
      ]),
    ).toEqual([
      { locale: 'en', href: '/en/about-us' },
      { locale: 'it', href: '/it/chi-siamo' },
    ]);
  });

  it('links to the page where it lives, with its ancestors, not to its bare slug', () => {
    expect(
      languageLinks(site(), [
        page('it', 'primo-avvio', ['guida']),
        page('en', 'first-run', ['guide']),
      ]),
    ).toEqual([
      { locale: 'it', href: '/it/guida/primo-avvio' },
      { locale: 'en', href: '/en/guide/first-run' },
    ]);
  });

  it('answers a locale of its home page at its root', () => {
    expect(
      languageLinks(site(), [page('it', 'home'), page('en', 'home')]),
    ).toEqual([
      { locale: 'it', href: '/it/' },
      { locale: 'en', href: '/en/' },
    ]);
  });

  it('leaves out a locale with no translation when the site does not fall back', () => {
    expect(languageLinks(site(), [page('it', 'chi-siamo')])).toEqual([
      { locale: 'it', href: '/it/chi-siamo' },
    ]);
  });

  it('sends a locale with no translation to the default locale’s page when the site falls back to it', () => {
    expect(
      languageLinks(site({ untranslatedPageFallback: 'redirect-to-default' }), [
        page('it', 'chi-siamo', ['azienda']),
      ]),
    ).toEqual([
      { locale: 'it', href: '/it/azienda/chi-siamo' },
      { locale: 'en', href: '/it/azienda/chi-siamo' },
    ]);
  });

  it('has nothing to fall back to when the default locale has no translation of the page either', () => {
    expect(
      languageLinks(site({ untranslatedPageFallback: 'redirect-to-default' }), [
        page('en', 'about-us'),
      ]),
    ).toEqual([{ locale: 'en', href: '/en/about-us' }]);
  });
});
