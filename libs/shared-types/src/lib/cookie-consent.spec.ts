import { describe, expect, it } from 'vitest';
import {
  cookieBannerSettingsSchema,
  DEFAULT_COOKIE_BANNER_SETTINGS,
  trackerScriptEntrySchema,
} from './cookie-consent';

describe('cookieBannerSettingsSchema', () => {
  it('accepts the default settings', () => {
    expect(
      cookieBannerSettingsSchema.safeParse(DEFAULT_COOKIE_BANNER_SETTINGS)
        .success,
    ).toBe(true);
  });

  it('rejects an unknown position', () => {
    const result = cookieBannerSettingsSchema.safeParse({
      ...DEFAULT_COOKIE_BANNER_SETTINGS,
      position: 'top-bar',
    });

    expect(result.success).toBe(false);
  });

  it('accepts per-locale copy overrides with partial fields', () => {
    const result = cookieBannerSettingsSchema.safeParse({
      ...DEFAULT_COOKIE_BANNER_SETTINGS,
      copyOverrides: { fr: { title: 'Cookies' } },
    });

    expect(result.success).toBe(true);
  });
});

describe('trackerScriptEntrySchema', () => {
  it('accepts a well-formed entry', () => {
    const result = trackerScriptEntrySchema.safeParse({
      id: 'a1',
      label: 'Google Analytics',
      category: 'measurement',
      placement: 'head',
      html: '<script>gtag("config", "G-XXXX")</script>',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown category', () => {
    const result = trackerScriptEntrySchema.safeParse({
      id: 'a1',
      label: 'Google Analytics',
      category: 'marketing',
      placement: 'head',
      html: '<script></script>',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty html value', () => {
    const result = trackerScriptEntrySchema.safeParse({
      id: 'a1',
      label: 'Google Analytics',
      category: 'measurement',
      placement: 'head',
      html: '',
    });

    expect(result.success).toBe(false);
  });
});
