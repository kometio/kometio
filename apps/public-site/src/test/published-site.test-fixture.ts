import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import type { PublishedPage, PublishedSite } from '@kometio/api-contracts';

/**
 * A site as the public renderer is given it, complete: what a test names is
 * overridden and the rest is what a site that has just been made has.
 */
export function publishedSite(
  overrides: Partial<PublishedSite> = {},
): PublishedSite {
  return {
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
    themeTokens: { blockStyles: {} },
    cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
    privacyPolicySlug: null,
    cookiePolicySlug: null,
    ...overrides,
  };
}

/**
 * A published page as the public renderer is given it, complete: what a
 * test names is overridden and the rest is an empty page of a new site.
 */
export function publishedPage(
  overrides: Partial<PublishedPage> = {},
): PublishedPage {
  return {
    id: null,
    content: [],
    seoMeta: { title: '', description: '' },
    locale: 'it',
    translations: [],
    ancestors: [],
    site: publishedSite(),
    header: null,
    footer: null,
    headerSticky: false,
    ...overrides,
  };
}
