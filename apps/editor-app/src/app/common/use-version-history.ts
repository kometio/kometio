import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
} from '@tanstack/react-query';

/**
 * A version history and the rollback to one of its versions, for anything
 * that has one — a page's structure, a language's text, the header and
 * footer. Fetched only while `enabled` (the dialog is open); after a
 * rollback the history is fetched again, and `onRestored` puts the
 * restored record where its editor reads it.
 */
export function useVersionHistory<
  Version,
  Restored,
  Key extends QueryKey,
>(options: {
  /** The history's own query options, as its `*QueryOptions` gives them. */
  versions: UseQueryOptions<Version[], Error, Version[], Key>;
  enabled: boolean;
  rollback: (versionId: string) => Promise<Restored>;
  onRestored: (restored: Restored) => void;
}) {
  const queryClient = useQueryClient();
  const versionsQuery = useQuery({
    ...options.versions,
    enabled: options.enabled,
  });
  const rollbackMutation = useMutation({
    mutationFn: options.rollback,
    onSuccess: (restored) => {
      options.onRestored(restored);
      void queryClient.invalidateQueries({
        queryKey: options.versions.queryKey,
      });
    },
  });
  return {
    versions: versionsQuery.data ?? [],
    isLoading: versionsQuery.isLoading,
    rollback: rollbackMutation.mutateAsync,
  };
}
