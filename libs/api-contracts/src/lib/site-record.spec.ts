import { describe, expect, it } from 'vitest';
import { siteRecordSchema } from './site-record';
import { siteRecordSample } from './site-samples.test-fixture';

describe('siteRecordSchema', () => {
  it('accepts what GET /sites/current answers, and keeps every field', () => {
    expect(siteRecordSchema.parse(siteRecordSample)).toEqual(siteRecordSample);
  });

  it('refuses a theme colour that is not a hex value', () => {
    expect(
      siteRecordSchema.safeParse({
        ...siteRecordSample,
        themePrimaryColor: 'blue',
      }).success,
    ).toBe(false);
  });

  it('refuses a fallback the site does not know', () => {
    expect(
      siteRecordSchema.safeParse({
        ...siteRecordSample,
        untranslatedPageFallback: 'show-anyway',
      }).success,
    ).toBe(false);
  });

  it('needs the retention field, null or a positive number of days', () => {
    const { formSubmissionRetentionDays: _omitted, ...without } =
      siteRecordSample;
    expect(siteRecordSchema.safeParse(without).success).toBe(false);
    expect(
      siteRecordSchema.safeParse({
        ...siteRecordSample,
        formSubmissionRetentionDays: 0,
      }).success,
    ).toBe(false);
    expect(
      siteRecordSchema.safeParse({
        ...siteRecordSample,
        formSubmissionRetentionDays: 30,
      }).success,
    ).toBe(true);
  });
});
