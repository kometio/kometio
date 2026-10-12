import { describe, expect, it } from 'vitest';
import {
  countMediaByKindQuerySchema,
  listMediaQuerySchema,
  MEDIA_SEARCH_MAX_LENGTH,
  updateMediaBodySchema,
  uploadMediaBodySchema,
} from './media-requests';

const siteId = '00000000-0000-4000-8000-000000000000';

describe('listMediaQuerySchema', () => {
  it('reads a query string: the site, the page numbers as numbers, a search and a kind', () => {
    expect(
      listMediaQuerySchema.parse({
        siteId,
        page: '2',
        pageSize: '40',
        search: ' logo ',
        kind: 'image',
      }),
    ).toEqual({ siteId, page: 2, pageSize: 40, search: 'logo', kind: 'image' });
  });

  it('defaults to the first page of twenty', () => {
    expect(listMediaQuerySchema.parse({ siteId })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
  });

  it('refuses a search longer than the library takes, a kind there is not, and a site that is no id', () => {
    expect(
      listMediaQuerySchema.safeParse({
        siteId,
        search: 'x'.repeat(MEDIA_SEARCH_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      listMediaQuerySchema.safeParse({ siteId, kind: 'folder' }).success,
    ).toBe(false);
    expect(listMediaQuerySchema.safeParse({ siteId: 'x' }).success).toBe(false);
  });
});

describe('the site bodies and queries', () => {
  it.each([
    ['countMediaByKindQuerySchema', countMediaByKindQuerySchema],
    ['uploadMediaBodySchema', uploadMediaBodySchema],
  ])('%s asks for a site and refuses what is not an id', (_name, schema) => {
    expect(schema.safeParse({ siteId }).success).toBe(true);
    expect(schema.safeParse({ siteId: 'not-an-id' }).success).toBe(false);
  });
});

describe('updateMediaBodySchema', () => {
  it('takes a name, an alternative text, or both', () => {
    expect(updateMediaBodySchema.safeParse({ filename: 'a.png' }).success).toBe(
      true,
    );
    expect(updateMediaBodySchema.safeParse({ alt: 'A logo' }).success).toBe(
      true,
    );
  });

  it('asks for something to change', () => {
    expect(updateMediaBodySchema.safeParse({}).success).toBe(false);
  });

  it('bounds what is read', () => {
    expect(
      updateMediaBodySchema.safeParse({ alt: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});
