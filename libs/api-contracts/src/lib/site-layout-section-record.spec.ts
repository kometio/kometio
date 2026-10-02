import { describe, expect, it } from 'vitest';
import {
  siteLayoutSectionRecordSchema,
  siteLayoutSectionVersionRecordSchema,
} from './site-layout-section-record';

const header = {
  id: 'l1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  locale: 'it',
  kind: 'header',
  status: 'draft',
  content: [],
  publishedContent: null,
  sticky: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('siteLayoutSectionRecordSchema', () => {
  it('accepts a header and a footer', () => {
    expect(siteLayoutSectionRecordSchema.parse(header)).toEqual(header);
    expect(
      siteLayoutSectionRecordSchema.safeParse({ ...header, kind: 'footer' })
        .success,
    ).toBe(true);
  });

  it('refuses a kind that is neither', () => {
    expect(
      siteLayoutSectionRecordSchema.safeParse({ ...header, kind: 'sidebar' })
        .success,
    ).toBe(false);
  });
});

describe('siteLayoutSectionVersionRecordSchema', () => {
  it('accepts one saved state', () => {
    expect(
      siteLayoutSectionVersionRecordSchema.safeParse({
        id: 'v1',
        tenantId: 'tenant-1',
        siteLayoutSectionId: 'l1',
        content: [],
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
