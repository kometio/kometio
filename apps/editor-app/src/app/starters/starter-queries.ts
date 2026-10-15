import { queryOptions } from '@tanstack/react-query';
import { getStarterOffer } from '../../lib/starters-api-client';

/**
 * Whether the site can still be given a starting point. Asked afresh each
 * time: it is read to decide what to draw, and choosing one — here or in
 * another tab — is what changes it.
 */
export function starterOfferQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['sites', siteId, 'starters'] as const,
    queryFn: () => getStarterOffer(siteId),
    staleTime: 0,
  });
}
