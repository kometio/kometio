import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  endAccountSession,
  endOtherAccountSessions,
} from '../../lib/account-api-client';
import { accountSessionsQueryOptions } from './account-queries';

/**
 * Where the signed-in person is signed in, and the two ways to end it
 * elsewhere (docs/adr/0129). Both refresh the list: what they did is what the
 * list then shows.
 */
export function useAccountSessions() {
  const queryClient = useQueryClient();
  const sessions = useQuery(accountSessionsQueryOptions());
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: accountSessionsQueryOptions().queryKey,
    });

  const endOne = useMutation({
    mutationFn: (id: string) => endAccountSession(id),
    onSettled: refresh,
  });
  const endOthers = useMutation({
    mutationFn: () => endOtherAccountSessions(),
    onSettled: refresh,
  });

  return {
    sessions: sessions.data,
    /** When the list was read: what "active now" is measured against, so that what is drawn is a function of what was fetched. */
    readAt: sessions.dataUpdatedAt,
    isLoading: sessions.isPending,
    hasFailed: sessions.isError,
    endSession: endOne.mutateAsync,
    endOtherSessions: endOthers.mutateAsync,
  };
}
