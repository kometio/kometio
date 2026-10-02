import type { ListPageGroupsFilters } from '../../lib/page-groups-api-client';
import type { PagesListFilterValues } from './pages-list-filter-bar';

/**
 * The filter bar's own values, turned into what the API takes.
 *
 * Shared by the Pages screen and every section's screen: they show the
 * same bar over the same list, and two copies of this would drift the
 * day a filter is added to one of them.
 */
export function toApiFilters(
  filters: PagesListFilterValues,
  debouncedSearch: string,
): ListPageGroupsFilters {
  return {
    search: debouncedSearch || undefined,
    createdAfter: filters.createdAfter
      ? new Date(filters.createdAfter)
      : undefined,
    createdBefore: filters.createdBefore
      ? new Date(filters.createdBefore)
      : undefined,
    createdBy: filters.createdBy || undefined,
    locale: filters.locale || undefined,
    status: filters.status || undefined,
  };
}
