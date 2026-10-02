import { describe, expect, it } from 'vitest';
import { publishedSiteSchema } from './published-site';
import { publishedSiteSample } from './site-samples.test-fixture';

describe('publishedSiteSchema', () => {
  it('accepts what the public API answers, and keeps every field', () => {
    expect(publishedSiteSchema.parse(publishedSiteSample)).toEqual(
      publishedSiteSample,
    );
  });

  it('carries the policy slugs as null when the pages are not set', () => {
    const { privacyPolicySlug: _omitted, ...without } = publishedSiteSample;
    expect(publishedSiteSchema.safeParse(without).success).toBe(false);
  });

  it('refuses an enabled locale list that is not a list of strings', () => {
    expect(
      publishedSiteSchema.safeParse({
        ...publishedSiteSample,
        enabledLocales: 'it',
      }).success,
    ).toBe(false);
  });
});
