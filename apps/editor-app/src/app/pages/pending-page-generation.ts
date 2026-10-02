import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/*
 * The prompt a page was created with, from the New page dialog to the
 * editor that writes it. Kept in the query client, which both already
 * share, and taken once: not in the address, where it would sit in the
 * history, and not in the history's own state, which a reload brings back
 * — generating the page a second time.
 */

const key = (groupId: string) => ['page-generation', 'pending', groupId];

export function rememberGenerationPrompt(
  queryClient: QueryClient,
  groupId: string,
  prompt: string,
): void {
  queryClient.setQueryData(key(groupId), prompt);
}

/**
 * The prompt this page was just created with, if any — read on the first
 * render and forgotten after it, so opening the page again does not
 * generate it again.
 */
export function usePendingGenerationPrompt(
  groupId: string,
): string | undefined {
  const queryClient = useQueryClient();
  // Read here, forgotten in the effect: an initializer that also removed
  // it would run twice under StrictMode, and the second read finds nothing.
  const [prompt] = useState(() =>
    queryClient.getQueryData<string>(key(groupId)),
  );
  useEffect(() => {
    queryClient.removeQueries({ queryKey: key(groupId), exact: true });
  }, [queryClient, groupId]);
  return prompt;
}
