import { describe, expect, it } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import {
  businessInfoSample,
  themeSettingsSample,
} from './site-samples.test-fixture';
import {
  countFormSubmissionsQuerySchema,
  updateBusinessInfoBodySchema,
  updateCookieBannerSettingsBodySchema,
  updateFormSubmissionRetentionBodySchema,
  updateGeneralSettingsBodySchema,
  updateLocaleSettingsBodySchema,
  updateSeoSettingsBodySchema,
  updateThemePackageBodySchema,
  updateThemeSettingsBodySchema,
  updateThemeTokensBodySchema,
} from './site-requests';

describe('updateBusinessInfoBodySchema', () => {
  it('takes the business’s details, each nullable', () => {
    expect(
      updateBusinessInfoBodySchema.safeParse(businessInfoSample).success,
    ).toBe(true);
    expect(
      updateBusinessInfoBodySchema.safeParse({
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
      }).success,
    ).toBe(true);
  });

  it('checks an email that is typed now, and trims it', () => {
    const body = {
      ...businessInfoSample,
      businessEmail: ' info@esempio.test ',
    };
    expect(updateBusinessInfoBodySchema.parse(body).businessEmail).toBe(
      'info@esempio.test',
    );
    expect(
      updateBusinessInfoBodySchema.safeParse({
        ...businessInfoSample,
        businessEmail: 'info',
      }).success,
    ).toBe(false);
  });
});

describe('updateGeneralSettingsBodySchema', () => {
  it('takes a name and a bare hostname, or none yet', () => {
    expect(
      updateGeneralSettingsBodySchema.safeParse({
        name: 'Sito',
        domain: 'esempio.test',
      }).success,
    ).toBe(true);
    expect(
      updateGeneralSettingsBodySchema.safeParse({ name: 'Sito', domain: null })
        .success,
    ).toBe(true);
  });

  it.each(['https://esempio.test', 'esempio.test:8080', 'Esempio.test', ''])(
    'refuses %j as a domain: no site would ever be found by it',
    (domain) => {
      expect(
        updateGeneralSettingsBodySchema.safeParse({ name: 'Sito', domain })
          .success,
      ).toBe(false);
    },
  );

  it('asks for a name', () => {
    expect(
      updateGeneralSettingsBodySchema.safeParse({ name: '', domain: null })
        .success,
    ).toBe(false);
  });
});

describe('the small settings', () => {
  it('takes a boolean for whether search engines may index the site', () => {
    expect(
      updateSeoSettingsBodySchema.safeParse({
        searchEngineIndexingEnabled: true,
      }).success,
    ).toBe(true);
    expect(updateSeoSettingsBodySchema.safeParse({}).success).toBe(false);
  });

  it('keeps answers forever (null) or for a whole number of days, at least one', () => {
    const body = (formSubmissionRetentionDays: unknown) =>
      updateFormSubmissionRetentionBodySchema.safeParse({
        formSubmissionRetentionDays,
      }).success;

    expect(body(null)).toBe(true);
    expect(body(30)).toBe(true);
    expect(body(0)).toBe(false);
    expect(body(1.5)).toBe(false);
  });

  it('counts what a retention would delete for a number of days that fits the database’s interval', () => {
    const query = (olderThanDays: string) =>
      countFormSubmissionsQuerySchema.safeParse({ olderThanDays }).success;

    expect(query('30')).toBe(true);
    expect(query('36500')).toBe(true);
    expect(query('36501')).toBe(false);
    expect(query('0')).toBe(false);
  });

  it('names a theme', () => {
    expect(
      updateThemePackageBodySchema.safeParse({ themeName: 'classic' }).success,
    ).toBe(true);
    expect(
      updateThemePackageBodySchema.safeParse({ themeName: '' }).success,
    ).toBe(false);
  });

  it('takes the cookie banner’s settings as the shared schema reads them', () => {
    expect(
      updateCookieBannerSettingsBodySchema.safeParse(
        DEFAULT_COOKIE_BANNER_SETTINGS,
      ).success,
    ).toBe(true);
  });
});

describe('updateLocaleSettingsBodySchema', () => {
  it('asks the default language to be one of the enabled', () => {
    expect(
      updateLocaleSettingsBodySchema.safeParse({
        defaultLocale: 'it',
        enabledLocales: ['it', 'en'],
        untranslatedPageFallback: 'redirect-to-default',
      }).success,
    ).toBe(true);
    expect(
      updateLocaleSettingsBodySchema.safeParse({
        defaultLocale: 'fr',
        enabledLocales: ['it', 'en'],
        untranslatedPageFallback: 'redirect-to-default',
      }).success,
    ).toBe(false);
  });
});

describe('updateThemeSettingsBodySchema', () => {
  it('takes the theme settings with a content width that is a real CSS length, or none', () => {
    expect(
      updateThemeSettingsBodySchema.safeParse({
        ...themeSettingsSample,
        contentWidth: '72rem',
      }).success,
    ).toBe(true);
    expect(
      updateThemeSettingsBodySchema.safeParse(themeSettingsSample).success,
    ).toBe(true);
  });

  it('refuses a content width that would be written into a page’s style as it is', () => {
    expect(
      updateThemeSettingsBodySchema.safeParse({
        ...themeSettingsSample,
        contentWidth: '1px; } body { display: none',
      }).success,
    ).toBe(false);
  });
});

describe('updateThemeTokensBodySchema', () => {
  it('takes a block type and its style, with the type’s own look when no variant is named', () => {
    const parsed = updateThemeTokensBodySchema.parse({
      blockType: 'Hero',
      style: { base: {} },
    });

    expect(parsed.blockType).toBe('Hero');
    expect(typeof parsed.variant).toBe('string');
  });
});
