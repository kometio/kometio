import { queryOptions } from '@tanstack/react-query';
import {
  listMissingPaths,
  listRedirects,
  testRedirect,
  type ListRedirectsFilters,
} from '../../lib/redirects-api-client';
import type { RedirectFilter } from './redirects-search';

export const REDIRECTS_PAGE_SIZE = 25;
export const MISSING_PATHS_PAGE_SIZE = 25;

/** Every query of this screen starts with this, so one invalidation reaches the list, the not-found list and a test. */
export const REDIRECTS_QUERY_KEY = ['redirects'] as const;

/** The server's own filters for the one choice a person makes. */
export function filtersFor(
  show: RedirectFilter,
  search: string | undefined,
): ListRedirectsFilters {
  const filters: ListRedirectsFilters = {};
  if (search) filters.search = search;
  if (show === 'needs-target') filters.needsATarget = true;
  if (show === 'manual' || show === 'list' || show === 'wordpress') {
    filters.origin = show;
  }
  return filters;
}

export function redirectsQueryOptions(
  siteId: string,
  page: number,
  filters: ListRedirectsFilters,
) {
  return queryOptions({
    queryKey: [
      ...REDIRECTS_QUERY_KEY,
      'list',
      siteId,
      page,
      REDIRECTS_PAGE_SIZE,
      filters.search,
      filters.origin,
      filters.needsATarget,
    ] as const,
    queryFn: () => listRedirects(siteId, page, REDIRECTS_PAGE_SIZE, filters),
  });
}

export function missingPathsQueryOptions(siteId: string, page: number) {
  return queryOptions({
    queryKey: [
      ...REDIRECTS_QUERY_KEY,
      'missing',
      siteId,
      page,
      MISSING_PATHS_PAGE_SIZE,
    ] as const,
    queryFn: () => listMissingPaths(siteId, page, MISSING_PATHS_PAGE_SIZE),
  });
}

/**
 * What the site would answer for an address, from the rules as they are now.
 * Not kept: a rule written a second ago changes the answer, and a stale
 * "nothing answers there" under a rule that was just made is the confusion
 * this exists to remove.
 */
export function redirectTestQueryOptions(siteId: string, address: string) {
  return queryOptions({
    queryKey: [...REDIRECTS_QUERY_KEY, 'test', siteId, address] as const,
    queryFn: () => testRedirect(siteId, address),
    staleTime: 0,
    gcTime: 0,
  });
}
