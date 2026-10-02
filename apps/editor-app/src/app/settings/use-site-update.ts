import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SiteRecord } from '@kometio/api-contracts';
import { siteQueryOptions } from './site-queries';

/**
 * Saves one group of a site's settings through `update`, and puts the site
 * the API answers with straight into the cache every screen reads it from.
 *
 * One hook for every settings screen: there were nine, one per group, each
 * the same twenty lines around a different API call.
 */
export function useSiteUpdate<Input>(
  siteId: string,
  update: (siteId: string, input: Input) => Promise<SiteRecord>,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Input) => update(siteId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(siteQueryOptions().queryKey, updated);
    },
  });
  return { save: mutation.mutateAsync, isSaving: mutation.isPending };
}
