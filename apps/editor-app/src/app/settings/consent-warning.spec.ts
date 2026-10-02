import { describe, expect, it } from 'vitest';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { scriptsWaitingForConsent } from './consent-warning';

const script = (category: 'necessary' | 'measurement' | 'experience') => ({
  id: category,
  label: category,
  category,
  placement: 'head' as const,
  html: '<script></script>',
});

const banner = (enabled: boolean) => ({
  ...DEFAULT_COOKIE_BANNER_SETTINGS,
  enabled,
});

describe('scriptsWaitingForConsent', () => {
  it('counts the scripts that need a consent nobody can give', () => {
    expect(
      scriptsWaitingForConsent({
        cookieBannerSettings: banner(false),
        themeTrackerScripts: [script('measurement'), script('experience')],
      }),
    ).toBe(2);
  });

  it('counts nothing once the banner is on: visitors are asked', () => {
    expect(
      scriptsWaitingForConsent({
        cookieBannerSettings: banner(true),
        themeTrackerScripts: [script('measurement')],
      }),
    ).toBe(0);
  });

  it('does not count a necessary script: nothing gates it', () => {
    expect(
      scriptsWaitingForConsent({
        cookieBannerSettings: banner(false),
        themeTrackerScripts: [script('necessary'), script('measurement')],
      }),
    ).toBe(1);
  });
});
