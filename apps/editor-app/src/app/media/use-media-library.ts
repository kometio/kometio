import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteMedia as apiDeleteMedia,
  updateMedia as apiUpdateMedia,
} from '../../lib/media-api-client';

// Same split as usePagesList: fetching the list is the route loader's job
// (see routes/_shell.media.index.tsx), this hook only owns what can be done
// to a file that is already in the library — delete it, or write its name
// and alternative text. Uploading has its
// own hook, since it works on several files at a time and answers for each
// (use-media-uploads.ts).
export function useMediaLibrary(siteId: string) {
  const queryClient = useQueryClient();

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['media', siteId] }),
    [queryClient, siteId],
  );

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => apiDeleteMedia(mediaId),
    onSuccess: invalidateList,
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      mediaId: string;
      changes: { filename?: string; alt?: string };
    }) => apiUpdateMedia(input.mediaId, input.changes),
    onSuccess: invalidateList,
  });

  return {
    updateMedia: (
      mediaId: string,
      changes: { filename?: string; alt?: string },
    ) => updateMutation.mutateAsync({ mediaId, changes }),
    deleteMedia: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
