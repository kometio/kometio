import { z } from 'zod';
import { PAGE_LIST_STATES } from '@kometio/shared-types';
import {
  EMPTY_PAGES_LIST_FILTERS,
  type PagesListFilterValues,
} from './pages-list-filter-bar';

/**
 * What the address of a list of pages says: which page of it, whether to
 * open on "New page", and every filter — so a filtered list can be reloaded,
 * sent to somebody, and come back to with the back button, as the page
 * number always could.
 *
 * Every field is `.catch(undefined)`: a garbled value in an address (a
 * status somebody made up, a search too long) is "no filter", not an error
 * screen.
 */
export const pagesListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  // Arrive with "New page" already open — the dashboard's first action.
  // Read once and dropped from the URL, so a reload does not ask again.
  new: z.boolean().optional().catch(undefined),
  search: z.string().max(200).optional().catch(undefined),
  status: z.enum(PAGE_LIST_STATES).optional().catch(undefined),
  locale: z.string().max(20).optional().catch(undefined),
  createdBy: z.string().max(64).optional().catch(undefined),
  // yyyy-mm-dd, as the date picker writes it.
  createdAfter: z.string().max(10).optional().catch(undefined),
  createdBefore: z.string().max(10).optional().catch(undefined),
});

export type PagesListSearch = z.infer<typeof pagesListSearchSchema>;

/** The filter bar's values, from an address: an absent one is the empty string the bar works in. */
export function filtersFromSearch(
  search: PagesListSearch,
): PagesListFilterValues {
  return {
    ...EMPTY_PAGES_LIST_FILTERS,
    search: search.search ?? '',
    status: search.status ?? '',
    locale: search.locale ?? '',
    createdBy: search.createdBy ?? '',
    createdAfter: search.createdAfter ?? '',
    createdBefore: search.createdBefore ?? '',
  };
}

/** The filters that go in an address, the empty ones left out: `?locale=` is not a filter, and it is not written. */
export function searchFromFilters(
  filters: PagesListFilterValues,
): Omit<PagesListSearch, 'page' | 'new'> {
  return {
    search: filters.search || undefined,
    status: filters.status || undefined,
    locale: filters.locale || undefined,
    createdBy: filters.createdBy || undefined,
    createdAfter: filters.createdAfter || undefined,
    createdBefore: filters.createdBefore || undefined,
  };
}
