import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import type { PublishedSite } from '@kometio/api-contracts';

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
