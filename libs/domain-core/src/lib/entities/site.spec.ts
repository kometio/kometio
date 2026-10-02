import { describe, expect, it } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { Site } from './site';

describe('Site entity', () => {
  const props = {
    id: 'site-1',
    tenantId: 'tenant-1',
    name: 'Il mio sito',
    domain: 'example.com',
    themeName: 'classic',
    defaultLocale: 'it',
    enabledLocales: ['it', 'en'],
    untranslatedPageFallback: 'redirect-to-default' as const,
    businessAddress: null,
    businessPhone: null,
    businessEmail: null,
    businessType: null,
    openingHours: null,
    searchEngineIndexingEnabled: false,
    themePrimaryColor: null,
    themeSecondaryColor: null,
    themeFontFamily: null,
    themeCustomCss: null,
    themeContentWidth: null,
    themeHeadScript: null,
    themeBodyScript: null,
    themeFaviconUrl: null,
    themeOverridesEnabled: true,
    themeAllowedTrackerDomains: [],
    formSubmissionRetentionDays: null,
    themeTrackerScripts: [],
    cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('fromProps exposes every prop via its getters', () => {
    const site = Site.fromProps(props);

    expect(site.id).toBe('site-1');
    expect(site.tenantId).toBe('tenant-1');
    expect(site.name).toBe('Il mio sito');
    expect(site.domain).toBe('example.com');
    expect(site.themeName).toBe('classic');
    expect(site.defaultLocale).toBe('it');
    expect(site.enabledLocales).toEqual(['it', 'en']);
    expect(site.untranslatedPageFallback).toBe('redirect-to-default');
    expect(site.businessAddress).toBeNull();
    expect(site.businessPhone).toBeNull();
    expect(site.businessType).toBeNull();
    expect(site.openingHours).toBeNull();
    expect(site.searchEngineIndexingEnabled).toBe(false);
    expect(site.createdAt).toEqual(props.createdAt);
  });

  it('fromProps/toProps round-trip without loss', () => {
    const site = Site.fromProps(props);

    expect(site.toProps()).toEqual(props);
  });

  it('supports a null domain (not yet configured)', () => {
    const site = Site.fromProps({ ...props, domain: null });

    expect(site.domain).toBeNull();
  });

  it('hasBusinessInfo is false when every business field is null', () => {
    const site = Site.fromProps(props);

    expect(site.hasBusinessInfo()).toBe(false);
  });

  it('hasBusinessInfo is true once any business field is set', () => {
    const site = Site.fromProps({ ...props, businessPhone: '+39 02 123' });

    expect(site.hasBusinessInfo()).toBe(true);
  });

  it('counts an email on its own as business info', () => {
    const site = Site.fromProps({
      ...props,
      businessEmail: 'ciao@example.com',
    });

    expect(site.hasBusinessInfo()).toBe(true);
  });

  it('updateBusinessInfo replaces the business fields', () => {
    const site = Site.fromProps(props);

    site.updateBusinessInfo({
      businessAddress: {
        street: 'Via Roma 1',
        postalCode: '20121',
        city: 'Milano',
        country: 'IT',
      },
      businessPhone: '+39 02 1234567',
      businessEmail: null,
      businessType: 'Restaurant',
      openingHours: [{ dayOfWeek: 'monday', ranges: [] }],
    });

    expect(site.businessAddress).toEqual({
      street: 'Via Roma 1',
      postalCode: '20121',
      city: 'Milano',
      country: 'IT',
    });
    expect(site.businessPhone).toBe('+39 02 1234567');
    expect(site.businessType).toBe('Restaurant');
    expect(site.openingHours).toEqual([{ dayOfWeek: 'monday', ranges: [] }]);
    expect(site.hasBusinessInfo()).toBe(true);
  });

  it('updateGeneralSettings replaces the name and domain', () => {
    const site = Site.fromProps(props);

    site.updateGeneralSettings({
      name: 'Nuovo nome',
      domain: 'nuovo.example.com',
    });

    expect(site.name).toBe('Nuovo nome');
    expect(site.domain).toBe('nuovo.example.com');
  });

  it('updateGeneralSettings supports clearing the domain back to null', () => {
    const site = Site.fromProps(props);

    site.updateGeneralSettings({ name: props.name, domain: null });

    expect(site.domain).toBeNull();
  });

  it('updateThemePackage replaces themeName', () => {
    const site = Site.fromProps(props);

    site.updateThemePackage({ themeName: 'docs-showcase' });

    expect(site.themeName).toBe('docs-showcase');
  });

  it('updateSeoSettings replaces the search engine indexing flag', () => {
    const site = Site.fromProps(props);

    site.updateSeoSettings({ searchEngineIndexingEnabled: true });

    expect(site.searchEngineIndexingEnabled).toBe(true);
  });

  it('updateFormSubmissionRetention replaces the retention days, including back to null', () => {
    const site = Site.fromProps(props);

    site.updateFormSubmissionRetention({ formSubmissionRetentionDays: 30 });
    expect(site.formSubmissionRetentionDays).toBe(30);

    site.updateFormSubmissionRetention({ formSubmissionRetentionDays: null });
    expect(site.formSubmissionRetentionDays).toBeNull();
  });

  it('updateLocaleSettings replaces default/enabled locales and the fallback', () => {
    const site = Site.fromProps(props);

    site.updateLocaleSettings({
      defaultLocale: 'en',
      enabledLocales: ['it', 'en', 'fr'],
      untranslatedPageFallback: 'not-available',
    });

    expect(site.defaultLocale).toBe('en');
    expect(site.enabledLocales).toEqual(['it', 'en', 'fr']);
    expect(site.untranslatedPageFallback).toBe('not-available');
  });

  it('themeSettings defaults to every override field null, overridesEnabled true', () => {
    const site = Site.fromProps(props);

    expect(site.themeSettings).toEqual({
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
    });
  });

  it('updateThemeSettings replaces every theme field, including trackerScripts', () => {
    const site = Site.fromProps(props);

    site.updateThemeSettings({
      primaryColor: '#18181b',
      secondaryColor: '#71717a',
      fontFamily: 'inter',
      customCss: '.kometio-hero { text-transform: uppercase; }',
      contentWidth: null,
      headScript: '<script>console.log("head")</script>',
      bodyScript: '<script>console.log("body")</script>',
      faviconUrl: 'https://example.com/favicon.png',
      overridesEnabled: false,
      allowedTrackerDomains: [{ label: 'Hotjar', domain: 'static.hotjar.com' }],
      trackerScripts: [
        {
          id: 'a1',
          label: 'Google Analytics',
          category: 'measurement',
          placement: 'head',
          html: '<script>gtag("config", "G-XXXX")</script>',
        },
      ],
    });

    expect(site.themeSettings).toEqual({
      primaryColor: '#18181b',
      secondaryColor: '#71717a',
      fontFamily: 'inter',
      customCss: '.kometio-hero { text-transform: uppercase; }',
      contentWidth: null,
      headScript: '<script>console.log("head")</script>',
      bodyScript: '<script>console.log("body")</script>',
      faviconUrl: 'https://example.com/favicon.png',
      overridesEnabled: false,
      allowedTrackerDomains: [{ label: 'Hotjar', domain: 'static.hotjar.com' }],
      trackerScripts: [
        {
          id: 'a1',
          label: 'Google Analytics',
          category: 'measurement',
          placement: 'head',
          html: '<script>gtag("config", "G-XXXX")</script>',
        },
      ],
    });
  });

  it('cookieBannerSettings defaults to disabled', () => {
    const site = Site.fromProps(props);

    expect(site.cookieBannerSettings).toEqual(DEFAULT_COOKIE_BANNER_SETTINGS);
  });

  it('updateCookieBannerSettings replaces the banner config', () => {
    const site = Site.fromProps(props);

    site.updateCookieBannerSettings({
      ...DEFAULT_COOKIE_BANNER_SETTINGS,
      enabled: true,
      position: 'bottom-right',
    });

    expect(site.cookieBannerSettings).toEqual({
      ...DEFAULT_COOKIE_BANNER_SETTINGS,
      enabled: true,
      position: 'bottom-right',
    });
  });
});
