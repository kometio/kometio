import { describe, expect, it } from 'vitest';
import {
  createTaxonomyBodySchema,
  createTermBodySchema,
  listTaxonomiesQuerySchema,
  moveTermBodySchema,
  pageGroupTermsBodySchema,
  reorderTermsBodySchema,
  updateTaxonomyBodySchema,
  updateTermBodySchema,
} from './taxonomy-requests';

const id = '00000000-0000-4000-8000-000000000000';
const other = '00000000-0000-4000-8000-000000000001';

describe('taxonomy bodies', () => {
  it('lists a site’s', () => {
    expect(listTaxonomiesQuerySchema.safeParse({ siteId: id }).success).toBe(
      true,
    );
    expect(listTaxonomiesQuerySchema.safeParse({}).success).toBe(false);
  });

  it('keeps three answers about the prefix apart: absent, null, and a string', () => {
    const base = { siteId: id, name: { it: 'Categorie' } };

    expect('prefix' in createTaxonomyBodySchema.parse(base)).toBe(false);
    expect(
      createTaxonomyBodySchema.parse({ ...base, prefix: null }).prefix,
    ).toBe(null);
    expect(
      createTaxonomyBodySchema.parse({ ...base, prefix: ' categoria ' }).prefix,
    ).toBe('categoria');
  });

  it('refuses a prefix that is empty or longer than a segment', () => {
    const base = { siteId: id, name: { it: 'Categorie' } };

    expect(
      createTaxonomyBodySchema.safeParse({ ...base, prefix: '   ' }).success,
    ).toBe(false);
    expect(
      createTaxonomyBodySchema.safeParse({ ...base, prefix: 'x'.repeat(121) })
        .success,
    ).toBe(false);
  });

  it('updates any of its parts, and the order is a whole number from zero', () => {
    expect(updateTaxonomyBodySchema.safeParse({}).success).toBe(true);
    expect(updateTaxonomyBodySchema.safeParse({ order: 0 }).success).toBe(true);
    expect(updateTaxonomyBodySchema.safeParse({ order: -1 }).success).toBe(
      false,
    );
  });
});

describe('term bodies', () => {
  it('creates by a name, with the address per language left to be made', () => {
    expect(
      createTermBodySchema.safeParse({ name: { it: 'Pizza' } }).success,
    ).toBe(true);
    expect(
      createTermBodySchema.safeParse({
        name: { it: 'Pizza' },
        slugs: { it: 'pizza' },
        parentId: null,
      }).success,
    ).toBe(true);
  });

  it('updates, with a landing page that null detaches', () => {
    expect(
      updateTermBodySchema.safeParse({ landingPageGroupId: null }).success,
    ).toBe(true);
    expect(
      updateTermBodySchema.safeParse({ landingPageGroupId: 'not-an-id' })
        .success,
    ).toBe(false);
  });

  it('moves under a parent or to the top', () => {
    expect(moveTermBodySchema.safeParse({ parentId: id }).success).toBe(true);
    expect(moveTermBodySchema.safeParse({ parentId: null }).success).toBe(true);
    expect(moveTermBodySchema.safeParse({}).success).toBe(false);
  });

  it('reorders by a sibling group that is not empty', () => {
    expect(
      reorderTermsBodySchema.safeParse({
        parentId: null,
        orderedTermIds: [id, other],
      }).success,
    ).toBe(true);
    expect(
      reorderTermsBodySchema.safeParse({ parentId: null, orderedTermIds: [] })
        .success,
    ).toBe(false);
  });

  it('sets the terms of a page as a list of ids, possibly none', () => {
    expect(pageGroupTermsBodySchema.safeParse({ termIds: [] }).success).toBe(
      true,
    );
    expect(pageGroupTermsBodySchema.safeParse({ termIds: ['x'] }).success).toBe(
      false,
    );
  });
});
