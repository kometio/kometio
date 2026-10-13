import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRedirect,
  deleteRedirect,
  dismissMissingPath,
  importRedirects,
  redirectsFromWordPress,
  updateRedirect,
} from '../../lib/redirects-api-client';
import type { RedirectFormBody } from './redirect-form';
import { REDIRECTS_QUERY_KEY } from './redirects-queries';

/**
 * The actions of the redirects screen. Fetching is the route's and the
 * section's `useQuery`; this owns what changes the rules, and every change
 * ends by asking again for everything under `['redirects']` — the list, what
 * was not found (a rule takes its address off it) and the answers of a test.
 */
export function useRedirects(siteId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: REDIRECTS_QUERY_KEY });

  const create = useMutation({
    mutationFn: (body: RedirectFormBody) => createRedirect({ siteId, ...body }),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RedirectFormBody }) =>
      updateRedirect(id, body),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRedirect(id),
  });

  const importList = useMutation({
    mutationFn: (input: { csv: string; dryRun: boolean }) =>
      importRedirects({ siteId, ...input }),
    // A dry run changes nothing, and asking again for the list after it
    // would flicker it for no reason.
    onSuccess: (report) => (report.applied ? refresh() : undefined),
  });

  const fromWordPress = useMutation({
    mutationFn: (input: { importJobId: string; dryRun: boolean }) =>
      redirectsFromWordPress({ siteId, ...input }),
    onSuccess: (plan) => (plan.report.applied ? refresh() : undefined),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissMissingPath(id),
    onSuccess: refresh,
  });

  return {
    createRedirect: create.mutateAsync,
    updateRedirect: (id: string, body: RedirectFormBody) =>
      update.mutateAsync({ id, body }),
    /** Several in one go end in one refresh, which the caller asks for. */
    deleteRedirect: remove.mutateAsync,
    refresh,
    importList: importList.mutateAsync,
    fromWordPress: fromWordPress.mutateAsync,
    dismissMissingPath: dismiss.mutateAsync,
  };
}
