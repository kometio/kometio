import { queryOptions } from '@tanstack/react-query';
import { listCollections } from '../../lib/collections-api-client';

export const collectionsQueryKey = (siteId: string) =>
  ['collections', siteId] as const;

/**
 * The collections this site has. Asked once and kept: they are read on
 * every screen (the sidebar renders one entry each) and change about as
 * often as the site's languages do.
 */
export function collectionsQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: collectionsQueryKey(siteId),
    queryFn: () => listCollections(siteId),
    staleTime: 5 * 60 * 1000,
  });
}
