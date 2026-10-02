import { useCallback, useState } from 'react';
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import { useSingleFlightSave } from './use-single-flight-save';
import type { SaveStatus } from './save-status';

export interface DraftEditorOptions<TRecord> {
  /** The cached record a save or a publish answers with, so the editor shows what the server holds. */
  queryKey: QueryKey;
  save: (content: Block[]) => Promise<TRecord>;
  publish: () => Promise<TRecord>;
}

/**
 * The draft/publish lifecycle of a block tree that is not a page — a header
 * or footer, a reusable section. Both used to carry their own copy of it,
 * and both copies fired one request per change with nothing ordering them:
 * an older save could land after a newer one, publishing saved and
 * published without waiting for the saves already on their way, and a
 * restore could be overwritten by a save that left before it.
 *
 * Saves go through the same single-flight queue the page editor uses, and
 * everything that acts on "the draft as the server holds it" waits for the
 * queue first: publishing here, restoring in the views (`whenSaved`), and
 * the canvas when it reloads the preview.
 */
export function useDraftEditor<TRecord>({
  queryKey,
  save,
  publish,
}: DraftEditorOptions<TRecord>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  const {
    schedule,
    whenSettled: whenSaved,
    lastSaveFailed: hasFailedSave,
  } = useSingleFlightSave<Block[]>(
    useCallback((content) => saveMutation.mutateAsync(content), [saveMutation]),
  );

  const publishMutation = useMutation({
    mutationFn: async (content: Block[]) => {
      // Through the queue, not beside it: the tree being published is sent
      // after whatever is already on its way, never before it.
      schedule(content);
      await whenSaved();
      if (hasFailedSave()) {
        throw new Error(t('canvas.status.publishUnsaved'));
      }
      return publish();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      setStatus({ kind: 'published' });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  const handlePublish = useCallback(
    (content: Block[]) => publishMutation.mutateAsync(content),
    [publishMutation],
  );

  // Derived from the mutation rather than recorded, so "what is happening"
  // and "what last happened" cannot disagree (see usePageGroupEditor).
  const isSaving = saveMutation.isPending;

  return {
    status: isSaving ? ({ kind: 'saving' } as const) : status,
    setStatus,
    isSaving,
    handleChange: schedule,
    handlePublish,
    whenSaved,
    hasFailedSave,
  };
}
