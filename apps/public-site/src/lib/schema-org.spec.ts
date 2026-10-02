import { describe, expect, it } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { type PublishedSite } from '@kometio/api-contracts';
import { absoluteSchemaUrl, buildSchemaOrgGraph } from './schema-org';

const baseSite: PublishedSite = {
  name: 'Il mio sito',
  domain: 'example.com',
  themeName: 'classic',
  defaultLocale: 'it',
  enabledLocales: ['it'],
  untranslatedPageFallback: 'redirect-to-default',
  businessAddress: null,
  businessPhone: null,
  businessEmail: null,
  businessType: null,
  openingHours: null,
  searchEngineIndexingEnabled: false,
  themeSettings: {
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    customCss: null,
    contentWidth: null,
    headScript: null,
    bodyScript: null,
    faviconUrl: null,
    overridesEnabled: true,
    allowedTrackerDomains: [],
    trackerScripts: [],
  },
  themeTokens: {
    blockStyles: {},
  },
  cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
  privacyPolicySlug: null,
  cookiePolicySlug: null,
};

const seoMeta = { title: 'Chi siamo', description: 'La nostra storia' };

describe('buildSchemaOrgGraph', () => {
  it('includes WebSite and WebPage but no LocalBusiness when the site has no business info', () => {
    const graph = buildSchemaOrgGraph({
      site: baseSite,
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': { '@type': string }[] };

    const types = graph['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['WebSite', 'WebPage']);
  });

  it('adds a LocalBusiness node once any business field is set', () => {
    const graph = buildSchemaOrgGraph({
      site: { ...baseSite, businessPhone: '+39 02 1234567' },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': { '@type': string; telephone?: string }[] };

    const business = graph['@graph'].find(
      (node) => node['@type'] !== 'WebSite' && node['@type'] !== 'WebPage',
    );
    expect(business?.telephone).toBe('+39 02 1234567');
  });

  it('declares the email on the LocalBusiness node, and a site with only an email still gets one', () => {
    const graph = buildSchemaOrgGraph({
      site: { ...baseSite, businessEmail: 'ciao@example.com' },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': { '@type': string; email?: string }[] };

    const business = graph['@graph'].find(
      (node) => node['@type'] !== 'WebSite' && node['@type'] !== 'WebPage',
    );
    expect(business?.email).toBe('ciao@example.com');
  });

  it('uses the site businessType as the schema.org @type when set', () => {
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        businessType: 'Restaurant',
        businessPhone: '+39 02 1234567',
        businessEmail: null,
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': { '@type': string }[] };

    const business = graph['@graph'][2];
    expect(business?.['@type']).toBe('Restaurant');
  });

  it('falls back to the generic LocalBusiness type when businessType is not set', () => {
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        businessAddress: {
          street: 'Via Roma 1',
          postalCode: '20121',
          city: 'Milano',
          country: 'IT',
        },
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': { '@type': string }[] };

    expect(graph['@graph'][2]?.['@type']).toBe('LocalBusiness');
  });

  it('writes the address as a PostalAddress, with the country as its ISO code', () => {
    // The point of docs/adr/0081: Google's Rich Results guidelines want
    // the parts, and `addressCountry` is specified as the code, not the
    // name the visitor reads.
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        businessAddress: {
          street: 'Via Giuseppe Garibaldi 12',
          postalCode: '20121',
          city: 'Milano',
          country: 'IT',
        },
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': Record<string, unknown>[] };

    expect(graph['@graph'][2]?.['address']).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Via Giuseppe Garibaldi 12',
      postalCode: '20121',
      addressLocality: 'Milano',
      addressCountry: 'IT',
    });
  });

  it('leaves out the address parts nobody filled in', () => {
    // A node asserting `addressLocality: ''` says the town is empty,
    // which is a different claim from not saying.
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        businessAddress: {
          street: 'Via Roma 1',
          postalCode: '',
          city: '',
          country: '',
        },
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': Record<string, unknown>[] };

    expect(graph['@graph'][2]?.['address']).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Via Roma 1',
    });
  });

  it('writes no address at all when every part is empty', () => {
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        businessPhone: '+39 02 1234567',
        businessAddress: {
          street: '',
          postalCode: '',
          city: '',
          country: '',
        },
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as { '@graph': Record<string, unknown>[] };

    expect(graph['@graph'][2]).not.toHaveProperty('address');
  });

  it('expands multi-range opening hours into one OpeningHoursSpecification per range', () => {
    const graph = buildSchemaOrgGraph({
      site: {
        ...baseSite,
        openingHours: [
          {
            dayOfWeek: 'monday',
            ranges: [
              { opens: '09:00', closes: '13:00' },
              { opens: '15:00', closes: '19:00' },
            ],
          },
          { dayOfWeek: 'sunday', ranges: [] },
        ],
      },
      seoMeta,
      pageUrl: 'https://example.com/chi-siamo',
    }) as {
      '@graph': {
        openingHoursSpecification?: { dayOfWeek: string; opens: string }[];
      }[];
    };

    const business = graph['@graph'][2];
    expect(business?.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Monday',
        opens: '09:00',
        closes: '13:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Monday',
        opens: '15:00',
        closes: '19:00',
      },
    ]);
  });
});

describe('absoluteSchemaUrl', () => {
  const origin = 'https://shop.example';

  it('makes a path absolute against the site', () => {
    expect(absoluteSchemaUrl('/uploads/shirt.webp', origin)).toBe(
      'https://shop.example/uploads/shirt.webp',
    );
    expect(absoluteSchemaUrl(' https://example.com/buy ', origin)).toBe(
      'https://example.com/buy',
    );
  });

  // Each of these threw from `new URL` inside ProductCard and took the
  // rest of the page with it.
  it.each(['https://', 'https:', 'https://exa mple.com', '//'])(
    'gives nothing for the half-typed "%s" instead of throwing',
    (value) => {
      expect(absoluteSchemaUrl(value, origin)).toBeUndefined();
    },
  );

  it('gives a search engine only web addresses', () => {
    expect(absoluteSchemaUrl('javascript:alert(1)', origin)).toBeUndefined();
    expect(
      absoluteSchemaUrl('mailto:shop@example.com', origin),
    ).toBeUndefined();
    expect(absoluteSchemaUrl('', origin)).toBeUndefined();
    expect(absoluteSchemaUrl(null, origin)).toBeUndefined();
  });
});
