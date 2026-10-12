import { describe, expect, it } from 'vitest';
import {
  getOrCreateSiteLayoutSectionQuerySchema,
  rollbackSiteLayoutSectionBodySchema,
  saveSiteLayoutSectionDraftBodyShape,
  setSiteLayoutSectionStickyBodySchema,
  siteLayoutSectionKindSchema,
} from './site-layout-section-requests';

const id = '00000000-0000-4000-8000-000000000000';

describe('the header and footer bodies', () => {
  it('names a kind that is a header or a footer', () => {
    expect(siteLayoutSectionKindSchema.safeParse('header').success).toBe(true);
    expect(siteLayoutSectionKindSchema.safeParse('sidebar').success).toBe(
      false,
    );
  });

  it('gets or creates one by site, language and kind', () => {
    expect(
      getOrCreateSiteLayoutSectionQuerySchema.safeParse({
        siteId: id,
        locale: 'it',
        kind: 'footer',
      }).success,
    ).toBe(true);
    expect(
      getOrCreateSiteLayoutSectionQuerySchema.safeParse({
        siteId: id,
        locale: 'i',
        kind: 'footer',
      }).success,
    ).toBe(false);
  });

  it('saves a draft, sets whether it sticks, and rolls back', () => {
    expect(
      saveSiteLayoutSectionDraftBodyShape.safeParse({ content: [] }).success,
    ).toBe(true);
    expect(
      setSiteLayoutSectionStickyBodySchema.safeParse({ sticky: true }).success,
    ).toBe(true);
    expect(
      setSiteLayoutSectionStickyBodySchema.safeParse({ sticky: 'yes' }).success,
    ).toBe(false);
    expect(
      rollbackSiteLayoutSectionBodySchema.safeParse({ versionId: id }).success,
    ).toBe(true);
  });
});
