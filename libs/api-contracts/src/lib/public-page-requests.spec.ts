import { describe, expect, it } from 'vitest';
import {
  publicAuthorBySlugQuerySchema,
  publicPageBySlugQuerySchema,
  publicPagePreviewQuerySchema,
  publicPagesChromeQuerySchema,
  publicPagesFeedQuerySchema,
  publicPagesSearchQuerySchema,
  publicPagesSitemapQuerySchema,
  publicPagesTreeQuerySchema,
  publicSectionPreviewQuerySchema,
  publicTermByPathQuerySchema,
} from './public-page-requests';

const domain = 'esempio.test';

describe('the public page queries', () => {
  it('finds a page by domain, language and path, the path as segments', () => {
    const parsed = publicPageBySlugQuerySchema.parse({
      domain,
      locale: 'it',
      path: 'servizi/idraulica',
    });

    expect(parsed.path).toEqual(['servizi', 'idraulica']);
  });

  it('asks for a hostname that is one, which is what a Host header is held to', () => {
    expect(
      publicPageBySlugQuerySchema.safeParse({
        domain: 'https://esempio.test',
        locale: 'it',
        path: 'x',
      }).success,
    ).toBe(false);
  });

  it('answers a term at one or two segments and no more', () => {
    const term = (path: string) =>
      publicTermByPathQuerySchema.safeParse({ domain, locale: 'it', path })
        .success;

    expect(term('pizza')).toBe(true);
    expect(term('menu/pizza')).toBe(true);
    expect(term('a/b/c')).toBe(false);
  });

  it('finds an author by the slug rule', () => {
    expect(
      publicAuthorBySlugQuerySchema.safeParse({
        domain,
        locale: 'it',
        slug: 'ada',
      }).success,
    ).toBe(true);
    expect(
      publicAuthorBySlugQuerySchema.safeParse({
        domain,
        locale: 'it',
        slug: 'Ada L',
      }).success,
    ).toBe(false);
  });

  it('lists by a site alone for the sitemap, and by a language for the chrome and the tree', () => {
    expect(publicPagesSitemapQuerySchema.safeParse({ domain }).success).toBe(
      true,
    );
    for (const schema of [
      publicPagesChromeQuerySchema,
      publicPagesTreeQuerySchema,
    ]) {
      expect(schema.safeParse({ domain, locale: 'it' }).success).toBe(true);
      expect(schema.safeParse({ domain }).success).toBe(false);
    }
  });

  it('bounds a feed’s length and coerces it from the query string', () => {
    expect(
      publicPagesFeedQuerySchema.parse({ domain, locale: 'it', limit: '20' })
        .limit,
    ).toBe(20);
    expect(
      publicPagesFeedQuerySchema.safeParse({
        domain,
        locale: 'it',
        limit: '101',
      }).success,
    ).toBe(false);
  });

  it('refuses a search of whitespace, which would reach the database as an empty query', () => {
    expect(
      publicPagesSearchQuerySchema.safeParse({ domain, locale: 'it', q: '   ' })
        .success,
    ).toBe(false);
    expect(
      publicPagesSearchQuerySchema.parse({
        domain,
        locale: 'it',
        q: ' idraulico ',
      }).q,
    ).toBe('idraulico');
  });

  it('previews by a token, a section’s with the language its links resolve in', () => {
    expect(publicPagePreviewQuerySchema.safeParse({ token: 't' }).success).toBe(
      true,
    );
    expect(publicPagePreviewQuerySchema.safeParse({ token: '' }).success).toBe(
      false,
    );
    expect(
      publicSectionPreviewQuerySchema.safeParse({ token: 't' }).success,
    ).toBe(false);
  });
});
