import { describe, expect, it } from 'vitest';
import { publishedSite } from '../test/published-site.test-fixture';
import { resolvePageSeo } from './page-seo';

const SITE = publishedSite({
  name: 'Sito',
  domain: 'esempio.test',
  enabledLocales: ['it', 'en'],
  openingHours: [],
});

const TRANSLATIONS = [
  { locale: 'it', slug: 'chi-siamo', ancestorSlugs: ['azienda'] },
  { locale: 'en', slug: 'about', ancestorSlugs: ['company'] },
];

const seo = (overrides: Partial<Parameters<typeof resolvePageSeo>[0]> = {}) =>
  resolvePageSeo({
    seoMeta: { title: 'Chi siamo', description: 'Una pagina' },
    locale: 'it',
    translations: TRANSLATIONS,
    site: SITE,
    origin: 'https://esempio.test',
    href: 'https://esempio.test/it/azienda/chi-siamo?utm_source=news',
    ...overrides,
  });

describe('resolvePageSeo', () => {
  it("builds the canonical from the page's own translation, not from the address it was asked at", () => {
    expect(seo().canonicalUrl).toBe(
      'https://esempio.test/it/azienda/chi-siamo',
    );
  });

  it("uses the editor's canonical when there is one", () => {
    expect(
      seo({
        seoMeta: {
          title: 't',
          description: 'd',
          canonical: 'https://altro.test/pagina',
        },
      }).canonicalUrl,
    ).toBe('https://altro.test/pagina');
  });

  it('falls back to the requested address only when the page has no translation in its own language', () => {
    expect(seo({ locale: 'fr' }).canonicalUrl).toBe(
      'https://esempio.test/it/azienda/chi-siamo?utm_source=news',
    );
  });

  it('says og:url is the canonical: two addresses in one document would be a contradiction', () => {
    const result = seo();

    expect(result.pageUrl).toBe(result.canonicalUrl);
  });

  it('lists every translation as an alternate, at its nested address, and the default one as x-default', () => {
    const result = seo();

    expect(result.alternates).toEqual([
      { locale: 'it', href: 'https://esempio.test/it/azienda/chi-siamo' },
      { locale: 'en', href: 'https://esempio.test/en/company/about' },
    ]);
    expect(result.xDefaultHref).toBe(
      'https://esempio.test/it/azienda/chi-siamo',
    );
  });

  it('has no x-default when the default language is not published', () => {
    expect(
      seo({
        translations: TRANSLATIONS.filter((t) => t.locale === 'en'),
        locale: 'en',
      }).xDefaultHref,
    ).toBeUndefined();
  });

  it('reads the Open Graph image from the SEO tags', () => {
    expect(
      seo({
        seoMeta: {
          title: 't',
          description: 'd',
          ogTags: { image: 'https://cdn.test/og.png' },
        },
      }).ogImage,
    ).toBe('https://cdn.test/og.png');
  });

  it('writes the structured data so that it cannot close the script it sits in', () => {
    const result = seo({ site: { ...SITE, name: '</script><b>' } });

    expect(result.schemaOrgJson).not.toContain('</script>');
    expect(result.schemaOrgJson).toContain('\\u003c/script>');
  });
});
