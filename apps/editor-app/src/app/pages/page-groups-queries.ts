import { queryOptions } from '@tanstack/react-query';
import {
  getPageGroup,
  listPageGroups,
  listPageGroupTranslations,
  listPageGroupVersions,
  listPageTranslationVersions,
  type ListPageGroupsFilters,
} from '../../lib/page-groups-api-client';

export const PAGE_GROUPS_PAGE_SIZE = 20;

// Every filter normalized into the key as a plain string — dates as ISO,
// an absent filter as `undefined` (TanStack Query treats an `undefined`
// value the same on every call, so two "no filter" fetches always share
// one cache entry instead of only coincidentally matching by reference).
export function pageGroupsQueryOptions(
  siteId: string,
  page: number,
  filters: ListPageGroupsFilters = {},
) {
  return queryOptions({
    queryKey: [
      'page-groups',
      'list',
      siteId,
      page,
      PAGE_GROUPS_PAGE_SIZE,
      filters.search,
      filters.createdAfter?.toISOString(),
      filters.createdBefore?.toISOString(),
      filters.createdBy,
      filters.locale,
      filters.collection,
      filters.excludeSubtreeOf,
    ] as const,
    queryFn: () => listPageGroups(siteId, page, PAGE_GROUPS_PAGE_SIZE, filters),
  });
}

export function pageGroupQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: ['page-groups', 'detail', groupId] as const,
    queryFn: () => getPageGroup(groupId),
  });
}

export function pageGroupVersionsQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: ['page-groups', 'versions', groupId] as const,
    queryFn: () => listPageGroupVersions(groupId),
  });
}

// Every locale of the group, including drafts — page-group-editor-view.tsx
// needs the full list to compute the merged view + language switcher
// options, not just published ones.
export function pageGroupTranslationsQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: ['page-groups', 'translations', groupId] as const,
    queryFn: () => listPageGroupTranslations(groupId),
  });
}

export function pageTranslationVersionsQueryOptions(translationId: string) {
  return queryOptions({
    queryKey: ['page-groups', 'translation-versions', translationId] as const,
    queryFn: () => listPageTranslationVersions(translationId),
  });
}
