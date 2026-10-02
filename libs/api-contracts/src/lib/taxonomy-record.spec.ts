import { describe, expect, it } from 'vitest';
import { taxonomyRecordSchema, termRecordSchema } from './taxonomy-record';

const STAMPS = {
  tenantId: 'tenant-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('taxonomyRecordSchema', () => {
  /*
   * The prefix is nullable and that is the feature, not an oversight:
   * `null` mounts the dimension's terms at the site root
   * (`/it/espresso`) instead of behind `/it/categoria/`.
   */
  it('accepts a dimension with no URL prefix', () => {
    const parsed = taxonomyRecordSchema.parse({
      ...STAMPS,
      id: 't1',
      siteId: 's1',
      prefix: null,
      name: { it: 'Categoria' },
      hierarchical: true,
      order: 0,
    });

    expect(parsed.prefix).toBeNull();
  });

  it('refuses a missing prefix — absent is not the same as deliberately none', () => {
    expect(() =>
      taxonomyRecordSchema.parse({
        ...STAMPS,
        id: 't1',
        siteId: 's1',
        name: {},
        hierarchical: true,
        order: 0,
      }),
    ).toThrow();
  });
});

describe('termRecordSchema', () => {
  it('carries a slug per language and nothing forcing them to agree', () => {
    const parsed = termRecordSchema.parse({
      ...STAMPS,
      id: 'x1',
      siteId: 's1',
      taxonomyId: 't1',
      parentId: null,
      name: { it: 'Macchine', en: 'Machines' },
      description: {},
      seoMeta: {},
      noindex: false,
      landingPageGroupId: null,
      order: 0,
      slugs: { it: 'macchine', en: 'machines' },
    });

    expect(parsed.slugs).toEqual({ it: 'macchine', en: 'machines' });
  });

  it('accepts a term with a hand-built landing page', () => {
    const parsed = termRecordSchema.parse({
      ...STAMPS,
      id: 'x1',
      siteId: 's1',
      taxonomyId: 't1',
      parentId: 'x0',
      name: {},
      description: {},
      seoMeta: {},
      noindex: true,
      landingPageGroupId: 'g1',
      order: 3,
      slugs: {},
    });

    expect(parsed.landingPageGroupId).toBe('g1');
    expect(parsed.parentId).toBe('x0');
  });
});
