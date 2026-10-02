import { describe, expect, it } from 'vitest';
import {
  pageGroupListItemSchema,
  pageGroupRecordSchema,
  pageTranslationRecordSchema,
  paginatedPageGroupsSchema,
} from './page-record';

const stamps = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};
const group = {
  id: 'g1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  parentId: null,
  order: 0,
  collectionId: null,
  content: [{ id: 'b1', type: 'Heading', props: { text: 'Ciao' } }],
  createdBy: null,
  ...stamps,
};
const translation = {
  id: 't1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  pageGroupId: 'g1',
  locale: 'it',
  slug: 'ciao',
  seoMeta: { title: 'Ciao', description: '' },
  fieldValues: {},
  status: 'draft',
  publishedSnapshot: null,
  isDiverged: false,
  divergedContent: null,
  createdBy: null,
  ...stamps,
};

describe('pageGroupRecordSchema', () => {
  it('accepts the structure every language of a page shares', () => {
    expect(pageGroupRecordSchema.parse(group)).toEqual(group);
  });
});

describe('pageTranslationRecordSchema', () => {
  it('accepts a draft that is linked to its group (no diverged content)', () => {
    expect(pageTranslationRecordSchema.parse(translation)).toEqual(translation);
  });

  it('refuses a status other than draft or published', () => {
    expect(
      pageTranslationRecordSchema.safeParse({
        ...translation,
        status: 'archived',
      }).success,
    ).toBe(false);
  });
});

describe('the pages list', () => {
  const item = {
    id: 'g1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    parentId: null,
    order: 0,
    collectionId: null,
    childCount: 0,
    createdByName: null,
    lastEditedAt: stamps.updatedAt,
    lastEditedByName: null,
    ...stamps,
    translations: [
      {
        locale: 'it',
        slug: 'ciao',
        title: 'Ciao',
        status: 'published',
        isDiverged: false,
        hasUnpublishedChanges: true,
      },
    ],
  };

  it('summarises each language for the row badges', () => {
    expect(pageGroupListItemSchema.parse(item)).toEqual(item);
    expect(
      paginatedPageGroupsSchema.parse({ items: [item], total: 1 }).total,
    ).toBe(1);
  });

  it('refuses a row that does not say how many pages hang under it: the delete dialog needs the number', () => {
    const without = Object.fromEntries(
      Object.entries(item).filter(([field]) => field !== 'childCount'),
    );
    expect(pageGroupListItemSchema.safeParse(without).success).toBe(false);
  });

  it('refuses a row whose language summary lacks the unpublished-changes flag', () => {
    const [first] = item.translations;
    const incomplete = Object.fromEntries(
      Object.entries(first ?? {}).filter(
        ([field]) => field !== 'hasUnpublishedChanges',
      ),
    );
    expect(
      pageGroupListItemSchema.safeParse({ ...item, translations: [incomplete] })
        .success,
    ).toBe(false);
  });
});
