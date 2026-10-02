import {
  DEFAULT_COOKIE_BANNER_SETTINGS,
  DEFAULT_THEME_TOKENS,
  type BusinessInfo,
  type ThemeSettings,
} from '@kometio/shared-types';

/**
 * A complete, valid value for each of the nested settings a site record and
 * a published site are built from, so their specs say what they are about
 * rather than restating forty fields. Invented data (docs: esempio.test).
 */
export const businessInfoSample: BusinessInfo = {
  businessAddress: {
    street: 'Via Esempio 1',
    postalCode: '00100',
    city: 'Roma',
    country: 'IT',
  },
  businessPhone: '+39 06 0000000',
  businessEmail: 'info@esempio.test',
  businessType: 'Restaurant',
  openingHours: [
    {
      dayOfWeek: 'monday',
      ranges: [{ opens: '09:00', closes: '18:00' }],
    },
  ],
};

export const themeSettingsSample: ThemeSettings = {
  primaryColor: '#18181b',
  secondaryColor: null,
  fontFamily: 'inter',
  customCss: null,
  contentWidth: null,
  headScript: null,
  bodyScript: null,
  faviconUrl: null,
  overridesEnabled: true,
  allowedTrackerDomains: [{ label: 'Esempio', domain: 'static.esempio.test' }],
  trackerScripts: [
    {
      id: 'a1',
      label: 'Analytics',
      category: 'measurement',
      placement: 'head',
      html: '<script src="https://static.esempio.test/a.js"></script>',
    },
  ],
};

export const publishedSiteSample = {
  ...businessInfoSample,
  name: 'Sito di esempio',
  domain: 'esempio.test',
  themeName: 'classic',
  defaultLocale: 'it',
  enabledLocales: ['it', 'en'],
  untranslatedPageFallback: 'redirect-to-default' as const,
  searchEngineIndexingEnabled: true,
  themeSettings: themeSettingsSample,
  themeTokens: DEFAULT_THEME_TOKENS,
  cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
  privacyPolicySlug: null,
  cookiePolicySlug: null,
};

export const siteRecordSample = {
  ...businessInfoSample,
  id: 'site-1',
  tenantId: 'tenant-1',
  name: 'Sito di esempio',
  domain: 'esempio.test',
  themeName: 'classic',
  defaultLocale: 'it',
  enabledLocales: ['it', 'en'],
  untranslatedPageFallback: 'redirect-to-default' as const,
  searchEngineIndexingEnabled: true,
  formSubmissionRetentionDays: null,
  themePrimaryColor: '#18181b',
  themeSecondaryColor: null,
  themeFontFamily: 'inter',
  themeCustomCss: null,
  themeContentWidth: null,
  themeHeadScript: null,
  themeBodyScript: null,
  themeFaviconUrl: null,
  themeOverridesEnabled: true,
  themeAllowedTrackerDomains: themeSettingsSample.allowedTrackerDomains,
  themeTrackerScripts: themeSettingsSample.trackerScripts,
  cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
  themeTokens: DEFAULT_THEME_TOKENS,
  createdAt: '2026-01-01T00:00:00.000Z',
};
