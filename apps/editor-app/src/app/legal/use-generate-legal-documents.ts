import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateLegalDocuments,
  previewLegalDocuments,
  type GenerateLegalDocumentsInput,
} from '../../lib/legal-documents-api-client';

// Preview has no persistence and its result depends on whatever the wizard's
// in-progress form values are right now — a `useMutation` triggered on
// demand (the review step's own effect) fits that better than a `useQuery`,
// which would need an explicit, ever-changing queryKey for the same reason.
export function usePreviewLegalDocuments(siteId: string) {
  const previewMutation = useMutation({
    mutationFn: (input: GenerateLegalDocumentsInput) =>
      previewLegalDocuments(siteId, input),
  });

  return {
    preview: previewMutation.mutateAsync,
    isPreviewing: previewMutation.isPending,
    previewError: previewMutation.error,
  };
}

export function useGenerateLegalDocuments(siteId: string) {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: (input: GenerateLegalDocumentsInput) =>
      generateLegalDocuments(siteId, input),
    onSuccess: () => {
      // New draft PageGroups now exist — invalidate every cached list page
      // for this site (partial key match, not a specific page/filters
      // combination) rather than patch the list in by hand, same reasoning
      // as duplicate-page-group's own caller (the created shape doesn't
      // match the list DTO 1:1).
      void queryClient.invalidateQueries({
        queryKey: ['page-groups', 'list', siteId],
      });
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
  };
}
