import { useCallback, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  mergeTranslatedContent,
  relinkedOverlay,
  type Block,
  type FieldValueOverlay,
} from '@kometio/shared-types';
import {
  divergePageTranslation,
  publishPageTranslation,
  relinkPageTranslation,
  saveDivergedPageTranslationContent,
  savePageGroupContent,
  savePageTranslationFieldValues,
  type PageTranslationRecord,
} from '../../lib/page-groups-api-client';
import {
  pageGroupQueryOptions,
  pageGroupTranslationsQueryOptions,
} from './page-groups-queries';
import { useSingleFlightSave } from '../common/use-single-flight-save';
import type { SaveStatus } from '../common/save-status';

export type { SaveStatus };

/** Replaces one translation by id in a cached list — shared by every mutation below that only ever touches one locale at a time. */
function replaceTranslation(
  translations: PageTranslationRecord[] | undefined,
  updated: PageTranslationRecord,
): PageTranslationRecord[] {
  return (translations ?? []).map((translation) =>
    translation.id === updated.id ? updated : translation,
  );
}

/**
 * Writes one updated translation into the SAME `pageGroupTranslationsQueryOptions(groupId)`
 * cache entry this hook itself reads via useSuspenseQuery — exported so
 * other mutations scoped to a single translation (SEO panel, translations-
 * management dialog) stay in sync with the editor without each owning a
 * second, divergent copy of this replace-by-id logic.
 */
export function useUpdateTranslationsCache(groupId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (updated: PageTranslationRecord) => {
      queryClient.setQueryData(
        pageGroupTranslationsQueryOptions(groupId).queryKey,
        (prev) => replaceTranslation(prev, updated),
      );
    },
    [queryClient, groupId],
  );
}

/**
 * i18n a livello di campo (see the plan) — orchestrates a PageGroup +
 * ITS translations, mirroring usePageEditor's role for the old Page model
 * but with two independent save targets instead of one:
 * - structural changes (insert/remove/reorder/non-translatable props, or
 *   ANY change on a diverged translation) go through `onChange`, which
 *   routes to savePageGroupContent for a linked translation or
 *   saveDivergedPageTranslationContent for a diverged one — CanvasEditorShell
 *   doesn't need to know which, `onChange`'s target already reflects it.
 * - a translatable-field edit at a non-default locale goes through
 *   `onSaveFieldValue` instead (see canvas-editor-shell.tsx's own
 *   `translationRouting` prop, which decides WHEN to call this one instead
 *   of `onChange` — this hook only owns WHERE each path persists to).
 */
export function usePageGroupEditor(groupId: string, initialLocale: string) {
  const { data: group } = useSuspenseQuery(pageGroupQueryOptions(groupId));
  const { data: translations } = useSuspenseQuery(
    pageGroupTranslationsQueryOptions(groupId),
  );
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [activeLocale, setActiveLocale] = useState(initialLocale);

  // Falls back to whatever locale IS there if the requested one somehow
  // isn't (e.g. a stale deep link to a locale that's since been removed).
  const activeTranslation =
    translations.find((t) => t.locale === activeLocale) ?? translations[0];
  // A group is never created without at least one translation (see
  // createPageGroupTranslation), so this is the server breaking that, and
  // it is said as what it is rather than as a TypeError on a field read.
  if (activeTranslation === undefined) {
    throw new Error(`Page group ${groupId} has no translation.`);
  }

  const displayedBlocks: Block[] = activeTranslation.isDiverged
    ? (activeTranslation.divergedContent ?? [])
    : mergeTranslatedContent(group.content, activeTranslation.fieldValues);

  const updateTranslationsCache = useUpdateTranslationsCache(groupId);

  const saveGroupContentMutation = useMutation({
    mutationFn: (content: Block[]) => savePageGroupContent(groupId, content),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        pageGroupQueryOptions(groupId).queryKey,
        updated,
      );
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  const saveDivergedContentMutation = useMutation({
    mutationFn: ({
      translationId,
      content,
    }: {
      translationId: string;
      content: Block[];
    }) => saveDivergedPageTranslationContent(translationId, content),
    onSuccess: (updated) => {
      updateTranslationsCache(updated);
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  // Single funnel for every structural change, keyed to whichever target
  // is correct for the CURRENTLY active translation at the moment a save
  // actually flushes.
  //
  // This used to carry an accepted race: switch locale inside the editor's
  // 300ms debounce window and the pending save fired against whatever tree
  // had replaced it, writing one translation's edit onto another's content.
  // It is no longer accepted — CanvasEditorShell now flushes pending saves
  // when its page changes, while its tree ref still points at the page
  // being left, so the save reaches the target captured when it was
  // scheduled. See its `flushedSyncKeyRef` effect, and the regression test
  // "saves an in-flight edit against the page it was made on".
  const {
    schedule: onChange,
    whenSettled: whenContentSaved,
    lastSaveFailed: lastContentSaveFailed,
  } = useSingleFlightSave<Block[]>(
    useCallback(
      (content) =>
        activeTranslation.isDiverged
          ? saveDivergedContentMutation.mutateAsync({
              translationId: activeTranslation.id,
              content,
            })
          : saveGroupContentMutation.mutateAsync(content),
      [
        activeTranslation.isDiverged,
        activeTranslation.id,
        saveDivergedContentMutation,
        saveGroupContentMutation,
      ],
    ),
  );

  const saveFieldValuesMutation = useMutation({
    mutationFn: ({
      translationId,
      fieldValues,
    }: {
      translationId: string;
      fieldValues: FieldValueOverlay;
    }) => savePageTranslationFieldValues(translationId, fieldValues),
    onSuccess: (updated) => {
      updateTranslationsCache(updated);
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  const {
    schedule: scheduleFieldValuesSave,
    whenSettled: whenFieldValuesSaved,
    lastSaveFailed: lastFieldValuesSaveFailed,
  } = useSingleFlightSave<{
    translationId: string;
    fieldValues: FieldValueOverlay;
  }>(
    useCallback(
      (value) => saveFieldValuesMutation.mutateAsync(value),
      [saveFieldValuesMutation],
    ),
  );

  const onSaveFieldValue = useCallback(
    (blockId: string, field: string, value: string) => {
      const nextFieldValues: FieldValueOverlay = {
        ...activeTranslation.fieldValues,
        [blockId]: {
          ...activeTranslation.fieldValues[blockId],
          [field]: value,
        },
      };
      // Optical update of the cached translation too — without this, a
      // fast switch away and back to this locale before the save round-trip
      // completes would briefly show the OLD value again (the merge below
      // reads straight from this same cache).
      updateTranslationsCache({
        ...activeTranslation,
        fieldValues: nextFieldValues,
      });
      scheduleFieldValuesSave({
        translationId: activeTranslation.id,
        fieldValues: nextFieldValues,
      });
    },
    [activeTranslation, scheduleFieldValuesSave, updateTranslationsCache],
  );

  const publishMutation = useMutation({
    mutationFn: (translationId: string) =>
      publishPageTranslation(translationId),
    onSuccess: (updated) => {
      updateTranslationsCache(updated);
      queryClient.invalidateQueries({ queryKey: ['page-groups'] });
      setStatus({ kind: 'published' });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });
  const handlePublish = useCallback(
    () => publishMutation.mutateAsync(activeTranslation.id),
    [publishMutation, activeTranslation.id],
  );

  const divergeMutation = useMutation({
    mutationFn: (translationId: string) =>
      divergePageTranslation(translationId),
    onSuccess: (updated) => {
      updateTranslationsCache(updated);
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });
  const handleDiverge = useCallback(
    () => divergeMutation.mutateAsync(activeTranslation.id),
    [divergeMutation, activeTranslation.id],
  );

  /** Both save queues drained — what the canvas waits for before reading the draft back. */
  const whenSaved = useCallback(async (): Promise<void> => {
    await Promise.all([whenContentSaved(), whenFieldValuesSaved()]);
  }, [whenContentSaved, whenFieldValuesSaved]);

  /** Whether the server is missing an edit because its save failed — read after `whenSaved`, before acting on the page as the server holds it. */
  const hasFailedSave = useCallback(
    () => lastContentSaveFailed() || lastFieldValuesSaveFailed(),
    [lastContentSaveFailed, lastFieldValuesSaveFailed],
  );

  const relinkMutation = useMutation({
    mutationFn: ({
      translationId,
      fieldValues,
    }: {
      translationId: string;
      fieldValues: FieldValueOverlay;
    }) => relinkPageTranslation(translationId, fieldValues),
    onSuccess: (updated) => {
      updateTranslationsCache(updated);
      setStatus({ kind: 'saved', at: Date.now() });
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  /**
   * Brings the active language back onto the shared structure, carrying
   * over the text of every block the structure still has (docs/adr/0075).
   *
   * The caller waits for `whenSaved` first, and refuses on `hasFailedSave`.
   * The fork is then read from the cache rather than from this render: the
   * last edit can land after the confirmation dialog opened, and relinking
   * from the tree as it was a moment earlier would drop that edit without
   * a word.
   */
  const handleRelink = useCallback(
    async (
      translatableFields: (blockType: string) => readonly string[],
    ): Promise<void> => {
      const latest = queryClient
        .getQueryData(pageGroupTranslationsQueryOptions(groupId).queryKey)
        ?.find((translation) => translation.id === activeTranslation.id);
      if (!latest?.divergedContent) {
        throw new Error(`Translation ${activeTranslation.id} is not unlinked`);
      }
      const latestGroup =
        queryClient.getQueryData(pageGroupQueryOptions(groupId).queryKey) ??
        group;
      const { fieldValues } = relinkedOverlay(
        latestGroup.content,
        latest.divergedContent,
        translatableFields,
      );
      await relinkMutation.mutateAsync({
        translationId: latest.id,
        fieldValues,
      });
    },
    [queryClient, groupId, activeTranslation.id, group, relinkMutation],
  );

  /**
   * A write is on the wire right now. Derived from the mutations rather
   * than tracked in `status`, so the two can never disagree: `status`
   * records what LAST happened, this says what is happening.
   *
   * Distinct from `whenSaved` above, which is the queue's own promise and
   * exists so the canvas can wait for a save before reading the draft back.
   * This one is for the person: it decides what the top bar says, and it is
   * half of the unsaved-changes guard — the other half is the debounce
   * window inside the canvas, which this hook never sees (see
   * useUnsavedChangesGuard).
   */
  const isSaving =
    saveGroupContentMutation.isPending ||
    saveDivergedContentMutation.isPending ||
    saveFieldValuesMutation.isPending ||
    relinkMutation.isPending;

  return {
    group,
    translations,
    activeLocale,
    setActiveLocale,
    activeTranslation,
    displayedBlocks,
    status: isSaving ? ({ kind: 'saving' } as const) : status,
    isSaving,
    onChange,
    whenSaved,
    hasFailedSave,
    onSaveFieldValue,
    handlePublish,
    handleDiverge,
    handleRelink,
  };
}
