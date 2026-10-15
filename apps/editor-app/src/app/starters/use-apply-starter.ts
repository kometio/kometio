import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StarterId } from '@kometio/shared-types';
import { applyStarter } from '../../lib/starters-api-client';

/**
 * Makes a starting point on the site. It changes nearly everything the
 * editor has shown — the pages, the header and footer, the forms, a section
 * of the sidebar, the categories — so what it leaves behind is not
 * refreshed one list at a time: all of it is read again.
 */
export function useApplyStarter(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (starterId: StarterId) => applyStarter(siteId, starterId),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
