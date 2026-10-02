import { useQueryClient } from '@tanstack/react-query';
import {
  rollbackToVersion,
  type SiteLayoutSectionKind,
} from '../../lib/site-layout-sections-api-client';
import {
  siteLayoutSectionQueryOptions,
  siteLayoutSectionVersionsQueryOptions,
} from './site-layout-sections-queries';
import { useVersionHistory } from '../common/use-version-history';

/** Version history for the site's header or footer in one language. */
export function useSiteLayoutSectionVersions(
  id: string,
  siteId: string,
  locale: string,
  kind: SiteLayoutSectionKind,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  return useVersionHistory({
    versions: siteLayoutSectionVersionsQueryOptions(id),
    enabled,
    rollback: (versionId: string) => rollbackToVersion(id, versionId),
    onRestored: (restored) =>
      queryClient.setQueryData(
        siteLayoutSectionQueryOptions(siteId, locale, kind).queryKey,
        restored,
      ),
  });
}
