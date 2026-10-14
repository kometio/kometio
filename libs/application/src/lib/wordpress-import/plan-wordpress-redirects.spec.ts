import { describe, expect, it } from 'vitest';
import type { WordPressPermalink } from '@kometio/shared-types';
import {
  planWordPressRedirects,
  type PlannablePage,
} from './plan-wordpress-redirects';

const post = (
  overrides: Partial<WordPressPermalink> = {},
): WordPressPermalink => ({
  id: 42,
  type: 'post',
  slug: 'hello-world',
  title: 'Hello world',
  link: 'https://old.example/2019/05/hello-world/',
  parentId: null,
  ...overrides,
});

const page = (
  slug: string,
  overrides: Partial<PlannablePage> = {},
): PlannablePage => ({
  locale: 'en',
  slug,
  ancestorSlugs: [],
  ...overrides,
});

const plan = (
  permalinks: WordPressPermalink[],
  pages: PlannablePage[],
  defaultLocale = 'en',
) => planWordPressRedirects(permalinks, pages, defaultLocale);

describe('planWordPressRedirects', () => {
  it('sends a post at its dated address, and at its number, to the page of its slug', () => {
    const result = plan(
      [post()],
      [page('hello-world', { ancestorSlugs: ['blog'] })],
    );

    expect(result.rows).toEqual([
      { from: '/2019/05/hello-world/', to: '/en/blog/hello-world' },
      { from: '/?p=42', to: '/en/blog/hello-world' },
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toEqual([]);
  });

  it('asks a page for by `page_id`, not `p`', () => {
    const result = plan(
      [
        post({
          id: 7,
          type: 'page',
          slug: 'about',
          link: 'https://old.example/about/',
        }),
      ],
      [page('about')],
    );

    expect(result.rows).toEqual([
      { from: '/about/', to: '/en/about' },
      { from: '/?page_id=7', to: '/en/about' },
    ]);
  });

  it('keeps the path of a site that lived in a folder', () => {
    const result = plan(
      [post({ link: 'https://old.example/blog/2019/05/hello-world/' })],
      [page('hello-world')],
    );

    expect(result.rows[0]).toEqual({
      from: '/blog/2019/05/hello-world/',
      to: '/en/hello-world',
    });
  });

  it('says the number once for a site that never had pretty addresses', () => {
    const result = plan(
      [post({ link: 'https://old.example/?p=42' })],
      [page('hello-world')],
    );

    expect(result.rows).toEqual([{ from: '/?p=42', to: '/en/hello-world' }]);
  });

  it('has no rule for the front page’s own address, only for its number', () => {
    const result = plan(
      [
        post({
          id: 2,
          type: 'page',
          slug: 'home',
          link: 'https://old.example/',
        }),
      ],
      [page('home')],
    );

    // The page called `home` is the language's own address.
    expect(result.rows).toEqual([{ from: '/?page_id=2', to: '/en/' }]);
  });

  describe('which page it is', () => {
    it('takes the page in the site’s own language when the slug is in several', () => {
      const result = plan(
        [post({ slug: 'contact' })],
        [page('contact', { locale: 'it' }), page('contact', { locale: 'en' })],
      );

      expect(result.rows[0]?.to).toBe('/en/contact');
    });

    it('takes the only one there is, in whatever language it is', () => {
      const result = plan(
        [post({ slug: 'contatti' })],
        [page('contatti', { locale: 'it' })],
      );

      expect(result.rows[0]?.to).toBe('/it/contatti');
    });

    it('tells two pages of one slug apart by who they sit under', () => {
      const permalinks = [
        post({
          id: 1,
          type: 'page',
          slug: 'team',
          link: 'https://old.example/about/team/',
          parentId: 10,
        }),
        post({
          id: 10,
          type: 'page',
          slug: 'about',
          link: 'https://old.example/about/',
        }),
      ];

      const result = plan(permalinks, [
        page('about'),
        page('team', { ancestorSlugs: ['about'] }),
        page('team', { ancestorSlugs: ['jobs'] }),
        page('jobs'),
      ]);

      expect(result.rows.find((row) => row.from === '/about/team/')?.to).toBe(
        '/en/about/team',
      );
      expect(result.ambiguous).toEqual([]);
    });

    it('does not guess between two pages it cannot tell apart', () => {
      const result = plan(
        [post({ slug: 'team' })],
        [
          page('team', { ancestorSlugs: ['about'] }),
          page('team', { ancestorSlugs: ['jobs'] }),
        ],
      );

      expect(result.rows).toEqual([]);
      expect(result.ambiguous).toHaveLength(1);
      expect(result.unmatched).toEqual([]);
    });

    it('says what has no page, so that it can be made and the list asked again', () => {
      const lost = post({ id: 9, slug: 'old-offer', title: 'Old offer' });

      const result = plan([lost, post()], [page('hello-world')]);

      expect(result.unmatched).toEqual([lost]);
      expect(result.matched).toHaveLength(1);
    });
  });

  it('does not say an address twice for two items of one address', () => {
    const result = plan([post(), post({ id: 43 })], [page('hello-world')]);

    expect(
      result.rows.filter((row) => row.from === '/2019/05/hello-world/'),
    ).toHaveLength(1);
  });

  it('ignores a link that is not an address at all', () => {
    const result = plan([post({ link: 'not a link' })], [page('hello-world')]);

    expect(result.rows).toEqual([{ from: '/?p=42', to: '/en/hello-world' }]);
  });
});
