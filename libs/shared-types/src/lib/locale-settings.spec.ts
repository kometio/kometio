import { describe, expect, it } from 'vitest';
import { localeSettingsSchema } from './locale-settings';

describe('localeSettingsSchema', () => {
  it('accepts valid locale settings', () => {
    const result = localeSettingsSchema.safeParse({
      defaultLocale: 'it',
      enabledLocales: ['it', 'en'],
      untranslatedPageFallback: 'redirect-to-default',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a defaultLocale that is not in enabledLocales', () => {
    const result = localeSettingsSchema.safeParse({
      defaultLocale: 'fr',
      enabledLocales: ['it', 'en'],
      untranslatedPageFallback: 'redirect-to-default',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty enabledLocales list', () => {
    const result = localeSettingsSchema.safeParse({
      defaultLocale: 'it',
      enabledLocales: [],
      untranslatedPageFallback: 'redirect-to-default',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid untranslatedPageFallback value', () => {
    const result = localeSettingsSchema.safeParse({
      defaultLocale: 'it',
      enabledLocales: ['it'],
      untranslatedPageFallback: 'do-something-else',
    });
    expect(result.success).toBe(false);
  });
});
