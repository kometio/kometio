import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelPageTranslationSchedule,
  schedulePageTranslationPublish,
} from '../../lib/page-groups-api-client';
import { useUpdateTranslationsCache } from './use-page-group-editor';

/**
 * Publishing one language at a moment (docs/adr/0135): setting it, changing
 * it, taking it back. The answer is the translation, which goes into the
 * editor's own cache, so the bar and the dialog read the same record; the
 * pages list is refetched, since its badge shows the schedule too.
 */
export function usePageTranslationSchedule(
  groupId: string,
  translationId: string,
) {
  const updateTranslationsCache = useUpdateTranslationsCache(groupId);
  const queryClient = useQueryClient();
  const onSuccess = (
    updated: Parameters<typeof updateTranslationsCache>[0],
  ) => {
    updateTranslationsCache(updated);
    void queryClient.invalidateQueries({ queryKey: ['page-groups'] });
  };

  const scheduleMutation = useMutation({
    mutationFn: (publishAt: Date) =>
      schedulePageTranslationPublish(translationId, publishAt),
    onSuccess,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelPageTranslationSchedule(translationId),
    onSuccess,
  });

  return {
    schedule: scheduleMutation.mutateAsync,
    cancelSchedule: cancelMutation.mutateAsync,
    isSaving: scheduleMutation.isPending || cancelMutation.isPending,
  };
}
