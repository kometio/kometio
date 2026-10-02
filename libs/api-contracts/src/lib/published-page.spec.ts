import { describe, expect, it } from 'vitest';
import { publishedPageSchema, publishedTermSchema } from './published-page';
import { publishedSiteSample } from './site-samples.test-fixture';

const page = {
  id: 'page-1',
  content: [{ id: 'b1', type: 'Heading', props: { text: 'Ciao' } }],
  seoMeta: { title: 'Ciao', description: '' },
  locale: 'it',
  translations: [{ locale: 'en', slug: 'hello', ancestorSlugs: [] }],
  ancestors: [{ slug: 'servizi', title: 'Servizi' }],
  site: publishedSiteSample,
  header: null,
  footer: null,
  headerSticky: false,
};

describe('publishedPageSchema', () => {
  it('accepts what GET /public/pages/by-slug answers', () => {
    expect(publishedPageSchema.parse(page)).toEqual(page);
  });

  it('reads a translation without ancestor slugs as a page at the root', () => {
    const parsed = publishedPageSchema.parse({
      ...page,
      translations: [{ locale: 'en', slug: 'hello' }],
    });

    expect(parsed.translations[0]?.ancestorSlugs).toEqual([]);
  });

  it('takes a page with no id (a term or author archive has none)', () => {
    expect(publishedPageSchema.safeParse({ ...page, id: null }).success).toBe(
      true,
    );
  });

  it('refuses a page whose blocks are not blocks', () => {
    expect(
      publishedPageSchema.safeParse({ ...page, content: [{ id: 'b1' }] })
        .success,
    ).toBe(false);
  });
});

describe('publishedTermSchema', () => {
  it('is a page plus the term it stands for', () => {
    const term = {
      id: 't1',
      name: 'Caffè',
      description: '',
      hasLandingPage: false,
      noindex: false,
    };

    expect(publishedTermSchema.parse({ ...page, term }).term).toEqual(term);
    expect(publishedTermSchema.safeParse(page).success).toBe(false);
  });
});
