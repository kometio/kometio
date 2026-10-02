import { describe, expect, it } from 'vitest';
import { EMPTY_PAGES_LIST_FILTERS } from './pages-list-filter-bar';
import {
  filtersFromSearch,
  pagesListSearchSchema,
  searchFromFilters,
} from './pages-list-search';

describe('pagesListSearchSchema', () => {
  it('reads every filter out of an address', () => {
    const parsed = pagesListSearchSchema.parse({
      page: '2',
      search: 'chi',
      status: 'pending',
      locale: 'en',
      createdBy: 'user-1',
      createdAfter: '2026-09-01',
    });

    expect(parsed).toMatchObject({
      page: 2,
      search: 'chi',
      status: 'pending',
      locale: 'en',
      createdBy: 'user-1',
      createdAfter: '2026-09-01',
    });
  });

  it('takes a garbled value for no filter, never for an error', () => {
    const parsed = pagesListSearchSchema.parse({
      page: 'abc',
      status: 'archived',
      search: 'x'.repeat(500),
    });

    expect(parsed.page).toBe(1);
    expect(parsed.status).toBeUndefined();
    expect(parsed.search).toBeUndefined();
  });
});

describe('filtersFromSearch / searchFromFilters', () => {
  it('turns an absent filter into the empty string the bar works in', () => {
    expect(filtersFromSearch(pagesListSearchSchema.parse({}))).toEqual(
      EMPTY_PAGES_LIST_FILTERS,
    );
  });

  it('writes only what is set, so `?locale=` is never written', () => {
    const written = searchFromFilters({
      ...EMPTY_PAGES_LIST_FILTERS,
      status: 'draft',
    });

    expect(written).toEqual({
      search: undefined,
      status: 'draft',
      locale: undefined,
      createdBy: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
    });
  });

  it('gives back what it was given', () => {
    const filters = {
      ...EMPTY_PAGES_LIST_FILTERS,
      search: 'chi',
      status: 'published' as const,
      locale: 'it',
    };

    expect(
      filtersFromSearch(
        pagesListSearchSchema.parse({ page: 1, ...searchFromFilters(filters) }),
      ),
    ).toEqual(filters);
  });
});
