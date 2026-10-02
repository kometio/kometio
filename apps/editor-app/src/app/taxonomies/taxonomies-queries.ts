import { queryOptions } from '@tanstack/react-query';
import {
  getPageGroupTerms,
  listTaxonomies,
  listTerms,
} from '../../lib/taxonomies-api-client';

export function taxonomiesQueryOptions(siteId: string) {
  return queryOptions({
    queryKey: ['taxonomies', siteId] as const,
    queryFn: () => listTaxonomies(siteId),
  });
}

export function termsQueryOptions(taxonomyId: string) {
  return queryOptions({
    queryKey: ['taxonomies', 'terms', taxonomyId] as const,
    queryFn: () => listTerms(taxonomyId),
  });
}

/** What one page is filed under — on the GROUP, so the same set in every language (ADR-0064). */
export function pageGroupTermsQueryOptions(pageGroupId: string) {
  return queryOptions({
    queryKey: ['page-groups', pageGroupId, 'terms'] as const,
    queryFn: () => getPageGroupTerms(pageGroupId),
  });
}
