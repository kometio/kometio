import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../common/use-debounced-value';
import type { PagesListFilterValues } from './pages-list-filter-bar';
import {
  filtersFromSearch,
  searchFromFilters,
  type PagesListSearch,
} from './pages-list-search';

/** How long the typing has to pause before the search is asked of the server and written into the address. */
const SEARCH_DEBOUNCE_MS = 300;

export interface PagesListFilters {
  /** What the bar shows: every choice as the address has it, the search as it is being typed. */
  filters: PagesListFilterValues;
  setFilters: (next: PagesListFilterValues) => void;
  /** The search once the typing has paused: what the list is asked for. */
  debouncedSearch: string;
}

/**
 * The filters of a list of pages, kept in its address.
 *
 * The choices — a state, a language, a creator, a date — are the address
 * itself: a choice writes it at once. The search text is the one thing that
 * cannot be: it changes on every key, and writing it into the address (and
 * asking the server) on each would blank the list under the person's hands.
 * It stays in the field as it is typed, and is written, and asked for, once
 * the typing pauses.
 *
 * Every change is written over the entry the person is on (the route's
 * `apply` says how), and back to the first page: the third page of a list
 * that has just become shorter may not exist.
 */
export function usePagesListFilters(
  search: PagesListSearch,
  apply: (changes: Omit<PagesListSearch, 'page' | 'new'>) => void,
): PagesListFilters {
  const [searchText, setSearchText] = useState(search.search ?? '');
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);
  const writtenSearch = search.search ?? '';

  useEffect(() => {
    if (debouncedSearch !== writtenSearch) {
      apply({
        ...searchFromFilters(filtersFromSearch(search)),
        search: debouncedSearch || undefined,
      });
    }
  }, [debouncedSearch, writtenSearch, search, apply]);

  return {
    filters: { ...filtersFromSearch(search), search: searchText },
    setFilters: (next) => {
      setSearchText(next.search);
      // Only what the address holds, written when it is not what it says
      // already: typing must not rewrite the address on every key.
      const changes = searchFromFilters({ ...next, search: writtenSearch });
      const current = searchFromFilters(filtersFromSearch(search));
      if (JSON.stringify(changes) !== JSON.stringify(current)) {
        apply(changes);
      }
    },
    debouncedSearch,
  };
}
