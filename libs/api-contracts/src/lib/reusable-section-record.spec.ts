import { describe, expect, it } from 'vitest';
import {
  reusableSectionListItemSchema,
  reusableSectionRecordSchema,
  reusableSectionVersionRecordSchema,
} from './reusable-section-record';

const section = {
  id: 's1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  name: 'Chi siamo',
  kind: 'shared',
  status: 'draft',
  content: [{ id: 'b1', type: 'Heading', props: { text: 'Ciao' } }],
  publishedContent: null,
  exposedFields: { b1: ['text'] },
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('reusableSectionRecordSchema', () => {
  it('accepts a section not yet published, with the fields a page may change', () => {
    expect(reusableSectionRecordSchema.parse(section)).toEqual(section);
  });

  it('refuses a kind that is neither shared nor a template', () => {
    expect(
      reusableSectionRecordSchema.safeParse({ ...section, kind: 'global' })
        .success,
    ).toBe(false);
  });
});

describe('reusableSectionListItemSchema', () => {
  it('adds how many pages and templates use the section', () => {
    const item = { ...section, usedOnPages: 2, usedInTemplates: 0 };

    expect(reusableSectionListItemSchema.parse(item)).toEqual(item);
    expect(reusableSectionListItemSchema.safeParse(section).success).toBe(
      false,
    );
  });
});

describe('reusableSectionVersionRecordSchema', () => {
  it('accepts one saved state of a section', () => {
    expect(
      reusableSectionVersionRecordSchema.safeParse({
        id: 'v1',
        tenantId: 'tenant-1',
        reusableSectionId: 's1',
        content: [],
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
