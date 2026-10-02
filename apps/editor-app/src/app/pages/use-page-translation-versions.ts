import { rollbackPageTranslationToVersion } from '../../lib/page-groups-api-client';
import { pageTranslationVersionsQueryOptions } from './page-groups-queries';
import { useUpdateTranslationsCache } from './use-page-group-editor';
import { useVersionHistory } from '../common/use-version-history';

/**
 * Version history for one language's own content — its text over the
 * shared structure, or its whole tree while it is unlinked (docs/adr/0075).
 * The counterpart to usePageGroupVersions.
 */
export function usePageTranslationVersions(
  groupId: string,
  translationId: string,
  enabled: boolean,
) {
  const updateTranslationsCache = useUpdateTranslationsCache(groupId);
  return useVersionHistory({
    versions: pageTranslationVersionsQueryOptions(translationId),
    enabled,
    rollback: (versionId: string) =>
      rollbackPageTranslationToVersion(translationId, versionId),
    onRestored: updateTranslationsCache,
  });
}
