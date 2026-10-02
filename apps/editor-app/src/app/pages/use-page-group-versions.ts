import { useQueryClient } from '@tanstack/react-query';
import { rollbackPageGroupToVersion } from '../../lib/page-groups-api-client';
import {
  pageGroupQueryOptions,
  pageGroupVersionsQueryOptions,
} from './page-groups-queries';
import { useVersionHistory } from '../common/use-version-history';

/**
 * Version history for the shared PageGroup structure — every language
 * that follows it. A language's own content has its own history, see
 * usePageTranslationVersions.
 */
export function usePageGroupVersions(groupId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useVersionHistory({
    versions: pageGroupVersionsQueryOptions(groupId),
    enabled,
    rollback: (versionId: string) =>
      rollbackPageGroupToVersion(groupId, versionId),
    onRestored: (restored) =>
      queryClient.setQueryData(
        pageGroupQueryOptions(groupId).queryKey,
        restored,
      ),
  });
}
