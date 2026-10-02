import { describe, expect, it } from 'vitest';
import { EMPTY_PAGES_LIST_FILTERS } from './pages-list-filter-bar';
import { toApiFilters } from './pages-list-filters';

describe('toApiFilters', () => {
  it('asks for nothing when no filter is set', () => {
    expect(toApiFilters(EMPTY_PAGES_LIST_FILTERS, '')).toEqual({
      search: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
      createdBy: undefined,
      locale: undefined,
      status: undefined,
    });
  });

  it('sends the state to the API, which judges it for the whole list and not for the page on screen', () => {
    expect(
      toApiFilters({ ...EMPTY_PAGES_LIST_FILTERS, status: 'pending' }, '')
        .status,
    ).toBe('pending');
  });

  it('turns the other values into what the API takes', () => {
    const filters = toApiFilters(
      {
        ...EMPTY_PAGES_LIST_FILTERS,
        locale: 'en',
        createdBy: 'user-1',
        createdAfter: '2026-09-01',
      },
      'chi',
    );

    expect(filters).toMatchObject({
      search: 'chi',
      locale: 'en',
      createdBy: 'user-1',
    });
    expect(filters.createdAfter).toEqual(new Date('2026-09-01'));
  });
});
