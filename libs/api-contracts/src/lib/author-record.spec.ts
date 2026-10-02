import { describe, expect, it } from 'vitest';
import { publishedAuthorSchema } from './author-record';
import { publishedSiteSample } from './site-samples.test-fixture';

describe('publishedAuthorSchema', () => {
  const author = {
    id: 'user-1',
    name: 'Ada Esempio',
    bio: '',
    avatar: null,
    path: null,
  };
  const page = {
    id: null,
    content: [],
    seoMeta: { title: 'Ada Esempio', description: '' },
    locale: 'it',
    translations: [],
    ancestors: [],
    site: publishedSiteSample,
    header: null,
    footer: null,
    headerSticky: false,
  };

  it('is a page carrying the person it belongs to', () => {
    expect(publishedAuthorSchema.parse({ ...page, author }).author).toEqual(
      author,
    );
  });

  it('refuses an author page without an author', () => {
    expect(publishedAuthorSchema.safeParse(page).success).toBe(false);
  });
});
