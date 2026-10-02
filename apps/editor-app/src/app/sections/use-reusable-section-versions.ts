import { useQueryClient } from '@tanstack/react-query';
import { rollbackToVersion } from '../../lib/reusable-sections-api-client';
import {
  reusableSectionQueryOptions,
  reusableSectionVersionsQueryOptions,
} from './reusable-sections-queries';
import { useVersionHistory } from '../common/use-version-history';

/** Version history for one reusable section — a shared section or a template. */
export function useReusableSectionVersions(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useVersionHistory({
    versions: reusableSectionVersionsQueryOptions(id),
    enabled,
    rollback: (versionId: string) => rollbackToVersion(id, versionId),
    onRestored: (restored) =>
      queryClient.setQueryData(
        reusableSectionQueryOptions(id).queryKey,
        restored,
      ),
  });
}
