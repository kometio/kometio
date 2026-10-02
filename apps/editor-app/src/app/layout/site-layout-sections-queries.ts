import { queryOptions } from '@tanstack/react-query';
import {
  getOrCreateSiteLayoutSection,
  listVersions,
  type SiteLayoutSectionKind,
} from '../../lib/site-layout-sections-api-client';

export function siteLayoutSectionQueryOptions(
  siteId: string,
  locale: string,
  kind: SiteLayoutSectionKind,
) {
  return queryOptions({
    queryKey: ['site-layout-sections', siteId, locale, kind] as const,
    queryFn: () => getOrCreateSiteLayoutSection(siteId, locale, kind),
  });
}

export function siteLayoutSectionVersionsQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['site-layout-sections', 'versions', id] as const,
    queryFn: () => listVersions(id),
  });
}
