import { describe, expect, it } from 'vitest';
import type { PageGridItem } from '@kometio/shared-types';
import {
  filterGridItems,
  selectedTermSlugs,
  termFilterHref,
} from './filter-grid-items';

function item(title: string, termSlugs: string[]): PageGridItem {
  return {
    pageGroupId: title,
    title,
    path: `/en/${title}`,
    publishedAt: null,
    excerpt: '',
    image: null,
    termSlugs,
  };
}

const dogFood = item('dog-food', ['cibo-per-cani', 'best-seller']);
const catFood = item('cat-food', ['cibo-per-gatti']);
const catToy = item('cat-toy', ['cibo-per-gatti', 'best-seller']);
const all = [dogFood, catFood, catToy];

describe('selectedTermSlugs', () => {
  it('reads every term in the address, once each', () => {
    const url = new URL('https://x/en/news?term=a&term=b&term=a');
    expect(selectedTermSlugs(url)).toEqual(['a', 'b']);
  });

  it('ignores an empty value, which is what a stray "?term=" is', () => {
    expect(
      selectedTermSlugs(new URL('https://x/en/news?term=&term=+')),
    ).toEqual([]);
  });
});

describe('filterGridItems', () => {
  it('leaves the list alone when nothing is selected', () => {
    expect(filterGridItems(all, [])).toEqual(all);
  });

  it('keeps only what carries the term', () => {
    expect(filterGridItems(all, ['cibo-per-gatti'])).toEqual([catFood, catToy]);
  });

  it('narrows twice rather than widening, when two terms are picked', () => {
    expect(filterGridItems(all, ['cibo-per-gatti', 'best-seller'])).toEqual([
      catToy,
    ]);
  });

  it('shows nothing for a term nobody carries, rather than everything', () => {
    expect(filterGridItems(all, ['pesce'])).toEqual([]);
  });
});

describe('termFilterHref', () => {
  it('adds a term and drops the page number', () => {
    const url = new URL('https://x/en/news?page=4');
    expect(termFilterHref(url, 'cibo-per-cani')).toBe(
      '/en/news?term=cibo-per-cani',
    );
  });

  it('removes a term that is already active, so a second click undoes it', () => {
    const url = new URL('https://x/en/news?term=a&term=b');
    expect(termFilterHref(url, 'a')).toBe('/en/news?term=b');
  });

  it('writes the unfiltered address with no parameter at all', () => {
    const url = new URL('https://x/en/news?term=a&term=b&page=2');
    expect(termFilterHref(url, null)).toBe('/en/news');
  });

  it('leaves everything else in the address alone', () => {
    const url = new URL('https://x/en/news?q=espresso&term=a');
    expect(termFilterHref(url, 'b')).toBe('/en/news?q=espresso&term=a&term=b');
  });
});
