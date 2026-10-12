import { describe, expect, it } from 'vitest';
import {
  createPageGroupBodyShape,
  createPageGroupTranslationBodySchema,
  listPageGroupsQuerySchema,
  moveToCollectionBodySchema,
  moveToParentBodySchema,
  relinkPageTranslationBodySchema,
  renamePageTranslationBodySchema,
  reorderPageGroupsBodySchema,
  rollbackToVersionBodySchema,
  saveAsTemplateBodySchema,
  saveDivergedPageTranslationContentBodyShape,
  savePageGroupContentBodyShape,
  savePageTranslationFieldValuesBodySchema,
  updatePageTranslationSeoMetaBodySchema,
} from './page-group-requests';

const id = '00000000-0000-4000-8000-000000000000';
const other = '00000000-0000-4000-8000-000000000001';
const translation = {
  locale: 'it',
  slug: 'chi-siamo',
  seoMeta: { title: 'Chi siamo', description: '' },
};
const blocks = [{ id: 'a', type: 'Text', props: { body: '<p>ciao</p>' } }];

describe('listPageGroupsQuerySchema', () => {
  it('reads a query string: numbers as numbers, dates as dates, with a first page of twenty', () => {
    const parsed = listPageGroupsQuerySchema.parse({
      siteId: id,
      createdAfter: '2026-01-01T00:00:00.000Z',
    });

    expect(parsed).toMatchObject({ page: 1, pageSize: 20 });
    expect(parsed.createdAfter).toBeInstanceOf(Date);
  });

  it('tells apart the three answers about a section: absent, none, an id', () => {
    const collection = (value?: string) =>
      listPageGroupsQuerySchema.safeParse({ siteId: id, collection: value })
        .success;

    expect(collection(undefined)).toBe(true);
    expect(collection('none')).toBe(true);
    expect(collection(id)).toBe(true);
    expect(collection('news')).toBe(false);
  });

  it('takes a state to filter by and refuses another', () => {
    expect(
      listPageGroupsQuerySchema.safeParse({ siteId: id, status: 'pending' })
        .success,
    ).toBe(true);
    expect(
      listPageGroupsQuerySchema.safeParse({ siteId: id, status: 'archived' })
        .success,
    ).toBe(false);
  });
});

describe('createPageGroupBodyShape', () => {
  it('creates a page alone, or with its first language', () => {
    expect(createPageGroupBodyShape.safeParse({ siteId: id }).success).toBe(
      true,
    );
    expect(
      createPageGroupBodyShape.safeParse({ siteId: id, translation }).success,
    ).toBe(true);
  });

  it('refuses content and a template together: the server would pick one silently', () => {
    expect(
      createPageGroupBodyShape.safeParse({
        siteId: id,
        content: blocks,
        templateId: other,
        translation,
      }).success,
    ).toBe(false);
  });

  it('refuses a template without the page’s first language', () => {
    expect(
      createPageGroupBodyShape.safeParse({ siteId: id, templateId: other })
        .success,
    ).toBe(false);
  });

  it('holds the first language’s address to the slug rule', () => {
    expect(
      createPageGroupTranslationBodySchema.safeParse({
        ...translation,
        slug: 'Chi Siamo',
      }).success,
    ).toBe(false);
  });
});

describe('the bodies that move and order', () => {
  it('moves to a collection or out of one, to a parent or to the top', () => {
    expect(
      moveToCollectionBodySchema.safeParse({ collectionId: null }).success,
    ).toBe(true);
    expect(moveToParentBodySchema.safeParse({ parentId: id }).success).toBe(
      true,
    );
    expect(moveToParentBodySchema.safeParse({}).success).toBe(false);
  });

  it('reorders a sibling group that is not empty', () => {
    expect(
      reorderPageGroupsBodySchema.safeParse({
        siteId: id,
        parentId: null,
        orderedPageGroupIds: [id],
      }).success,
    ).toBe(true);
    expect(
      reorderPageGroupsBodySchema.safeParse({
        siteId: id,
        parentId: null,
        orderedPageGroupIds: [],
      }).success,
    ).toBe(false);
  });

  it('rolls back to a version by its id', () => {
    expect(
      rollbackToVersionBodySchema.safeParse({ versionId: id }).success,
    ).toBe(true);
    expect(
      rollbackToVersionBodySchema.safeParse({ versionId: 'v1' }).success,
    ).toBe(false);
  });
});

describe('the bodies of a language', () => {
  it('saves the shared structure and the fork’s own as content, and refuses what is not a block', () => {
    expect(
      savePageGroupContentBodyShape.safeParse({ content: blocks }).success,
    ).toBe(true);
    expect(
      saveDivergedPageTranslationContentBodyShape.safeParse({ content: blocks })
        .success,
    ).toBe(true);
    expect(
      savePageGroupContentBodyShape.safeParse({ content: [{ nope: true }] })
        .success,
    ).toBe(false);
  });

  it('saves and relinks by an overlay of field values', () => {
    expect(
      savePageTranslationFieldValuesBodySchema.safeParse({ fieldValues: {} })
        .success,
    ).toBe(true);
    expect(
      relinkPageTranslationBodySchema.safeParse({ fieldValues: {} }).success,
    ).toBe(true);
  });

  it('updates the meta, and renames by an address that follows the slug rule', () => {
    expect(
      updatePageTranslationSeoMetaBodySchema.safeParse({
        seoMeta: { title: 'T', description: '' },
      }).success,
    ).toBe(true);
    expect(
      renamePageTranslationBodySchema.safeParse({
        slug: 'nuovo-indirizzo',
        parentGroupId: null,
      }).success,
    ).toBe(true);
    expect(
      renamePageTranslationBodySchema.safeParse({
        slug: 'Nuovo Indirizzo',
        parentGroupId: null,
      }).success,
    ).toBe(false);
  });

  it('saves as a template under a bounded name', () => {
    expect(
      saveAsTemplateBodySchema.safeParse({ name: 'Landing' }).success,
    ).toBe(true);
    expect(saveAsTemplateBodySchema.safeParse({ name: '  ' }).success).toBe(
      false,
    );
    expect(
      saveAsTemplateBodySchema.safeParse({ name: 'x'.repeat(121) }).success,
    ).toBe(false);
  });
});
