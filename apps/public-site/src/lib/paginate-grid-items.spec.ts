import { describe, expect, it } from 'vitest';
import type { PageGridItem } from '@kometio/shared-types';
import { gridPageHref, paginateGridItems } from './paginate-grid-items';

function items(count: number): PageGridItem[] {
  return Array.from({ length: count }, (_, index) => ({
    pageGroupId: `g${index}`,
    title: `Article ${index + 1}`,
    path: `/en/a${index + 1}`,
    publishedAt: null,
    excerpt: '',
    image: null,
    termSlugs: [],
  }));
}

describe('paginateGridItems', () => {
  it('leaves the list alone when everything fits on one page', () => {
    const all = items(5);

    expect(paginateGridItems(all, 0, 1)).toEqual({
      items: all,
      page: 1,
      totalPages: 1,
    });
  });

  it('cuts the list into pages of the size asked for', () => {
    const page = paginateGridItems(items(7), 3, 1);

    expect(page.totalPages).toBe(3);
    expect(page.items.map((item) => item.title)).toEqual([
      'Article 1',
      'Article 2',
      'Article 3',
    ]);
  });

  /*
   * The last page is where an archive loses articles: a remainder page
   * that is dropped, or a slice that runs past the end.
   */
  it('shows the remainder on the last page', () => {
    const page = paginateGridItems(items(7), 3, 3);

    expect(page.items.map((item) => item.title)).toEqual(['Article 7']);
  });

  it('brings a page number past the end back to the last page', () => {
    expect(paginateGridItems(items(7), 3, 99).page).toBe(3);
    expect(paginateGridItems(items(7), 3, 0).page).toBe(1);
  });

  it('reads the page number as it arrives from a URL', () => {
    expect(paginateGridItems(items(7), 3, '2').items[0]?.title).toBe(
      'Article 4',
    );
    expect(paginateGridItems(items(7), 3, 'nonsense').page).toBe(1);
    expect(paginateGridItems(items(7), 3, null).page).toBe(1);
  });

  it('has nothing to page through when the term lists nothing', () => {
    expect(paginateGridItems([], 10, 2)).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
    });
  });
});

describe('gridPageHref', () => {
  const url = new URL('https://example.com/en/news?tag=cats');

  it('keeps everything else in the address', () => {
    expect(gridPageHref(url, 3)).toBe('/en/news?tag=cats&page=3');
  });

  /*
   * One list, one address: `?page=1` and no parameter at all would be two
   * URLs for the same archive.
   */
  it('writes page one without the parameter', () => {
    expect(gridPageHref(new URL('https://example.com/en/news?page=4'), 1)).toBe(
      '/en/news',
    );
  });
});
