import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  updateBlockProps,
  updateBlockStyleOverride,
  updateBlockVariant,
} from './use-block-tree';
import type { PreviewBridgeState } from './use-preview-bridge';
import {
  blockIdFromTimerKey,
  usePropertyPatch,
  type UsePropertyPatchResult,
} from './use-property-patch';
import { findBlockById } from '@kometio/shared-types';

export interface CanvasTranslationRouting {
  activeLocale: string;
  defaultLocale: string;
  onSaveFieldValue: (blockId: string, field: string, value: string) => void;
}

export interface UseCanvasDraftParams {
  /** The tree as the caller last saved it. */
  blocks: Block[];
  pageId: string;
  /** Bumped on an explicit rollback, which replaces the local tree like a page change does. */
  restoredAt: number;
  token: string | null;
  sectionPreview: { sectionId: string; locale: string } | undefined;
  registry: BlockDescriptor[];
  translationRouting: CanvasTranslationRouting | undefined;
  onChange: (blocks: Block[]) => void;
  /** Resolves once the draft is saved — see usePropertyPatch. */
  whenSaved?: () => Promise<void>;
  bridge: Pick<PreviewBridgeState, 'patchBlock'>;
}

export interface CanvasDraft extends UsePropertyPatchResult {
  localBlocks: Block[];
  setLocalBlocks: Dispatch<SetStateAction<Block[]>>;
  /** What every debounced save reads — see the effect at the bottom of this hook for why WHEN it moves matters. */
  localBlocksRef: MutableRefObject<Block[]>;
  /**
   * Where a finished debounce burst reports its undo entry.
   *
   * A ref and not a parameter: `recordEdit` comes from
   * useBlockTreeMutations, which has to be called after this hook (it needs
   * the local tree this hook owns). The bursts only ever end later, from a
   * debounce timer, so the shell binds it in an effect once the mutations
   * exist, and a ref bridges the gap without reordering two hooks whose
   * order is dictated by their real dependencies.
   */
  recordEditRef: MutableRefObject<
    ((blockId: string, after: Block[]) => void) | null
  >;
}

/**
 * The page being edited, as the editor holds it between saves.
 *
 * A locally mutated optimistic copy — every change shows in the canvas,
 * the Layers panel and the toolbar at once, and reaches the caller after
 * its debounce. It is resynced from `blocks` only on a page change or an
 * explicit rollback, never on every incoming `blocks`: the caller writes
 * back the same value `onChange` just sent, and resyncing there too would
 * remount the local tree on every successful save, losing the latest
 * optimistic state whenever the round trip is slow.
 */
export function useCanvasDraft({
  blocks,
  pageId,
  restoredAt,
  token,
  sectionPreview,
  registry,
  translationRouting,
  onChange,
  whenSaved,
  bridge,
}: UseCanvasDraftParams): CanvasDraft {
  // "Adjust state during render" — React's recommended way to reset state
  // derived from a changed key — rather than an effect with a setState in
  // it, which would cost one wasted render showing the previous page.
  const syncKey = `${pageId}:${restoredAt}`;
  const [lastSyncKey, setLastSyncKey] = useState(syncKey);
  const [localBlocks, setLocalBlocks] = useState(blocks);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    setLocalBlocks(blocks);
  }

  const localBlocksRef = useRef(localBlocks);
  const recordEditRef = useRef<
    ((blockId: string, after: Block[]) => void) | null
  >(null);

  const patch = usePropertyPatch({
    pageId,
    fragmentSection: sectionPreview,
    token: token ?? '',
    // One history entry per debounce burst. Only the resulting tree is
    // passed: what to go back to is the history's own last committed state,
    // so this never snapshots a "before" at burst start — which was wrong
    // for inline typing, where the optimistic update lands during render,
    // one keystroke ahead of the effect that schedules the save. See
    // undo-burst-boundary.spec.tsx.
    onBurstEnd: (timerKey) => {
      recordEditRef.current?.(
        blockIdFromTimerKey(timerKey),
        localBlocksRef.current,
      );
    },
    onSaveDraft: (blockId, changedKey, props) => {
      const next = updateBlockProps(localBlocksRef.current, blockId, props);
      setLocalBlocks(next);

      // Field-level i18n: in a LINKED language other than the default, a
      // `translatable` field never touches the shared structure — it goes to
      // this translation's own `fieldValues` overlay instead. Read at the
      // moment of the save, not at the render that scheduled it: the
      // selection may have changed in between.
      const changedValue = props[changedKey];
      const block = findBlockById(next, blockId);
      const descriptor = block
        ? registry.find((d) => d.type === block.type)
        : undefined;
      const fieldDescriptor = descriptor?.fields.find(
        (f) => f.key === changedKey,
      );
      const isTranslatableFieldValue =
        translationRouting &&
        translationRouting.activeLocale !== translationRouting.defaultLocale &&
        fieldDescriptor &&
        'translatable' in fieldDescriptor &&
        fieldDescriptor.translatable &&
        typeof changedValue === 'string';

      if (isTranslatableFieldValue) {
        translationRouting.onSaveFieldValue(blockId, changedKey, changedValue);
      } else {
        onChange(next);
      }
    },
    onSaveStyleOverride: (blockId, styleOverride) => {
      const next = updateBlockStyleOverride(
        localBlocksRef.current,
        blockId,
        styleOverride,
      );
      setLocalBlocks(next);
      onChange(next);
    },
    onSaveVariant: (blockId, variant) => {
      const next = updateBlockVariant(localBlocksRef.current, blockId, variant);
      setLocalBlocks(next);
      onChange(next);
    },
    patchBlock: bridge.patchBlock,
    whenSaved,
  });
  const { flushAll } = patch;

  /**
   * `localBlocksRef` is what every debounced save reads to build the tree it
   * persists, so WHEN it is repointed decides which page a save in flight
   * lands on. Both halves live in one effect, in this order, on purpose:
   * splitting them into two would make the fix depend on their declaration
   * order, which is invisible and one refactor away from silently coming
   * undone.
   */
  const flushedSyncKeyRef = useRef(syncKey);
  useEffect(() => {
    if (flushedSyncKeyRef.current !== syncKey) {
      // The page changed under us — switching language re-renders the shell
      // rather than remounting it. Anything still pending belongs to the
      // page being LEFT, and its `fire` closure still holds that page's save
      // target; only this ref is shared. So fire it here, while the ref still
      // points at the tree it was scheduled against. Do not close the
      // bursts: the history has already been reset for the new page (see
      // useBlockTreeMutations), and an entry recorded now would undo into
      // the page you just left.
      flushAll({ closeBursts: false });
      flushedSyncKeyRef.current = syncKey;
    }
    localBlocksRef.current = localBlocks;
  });

  // Leaving the editor flushes what is still in the debounce — see the
  // unmount effect in usePropertyPatch, which owns the timers and is the
  // only place that can do it in the right order.

  return {
    ...patch,
    localBlocks,
    setLocalBlocks,
    localBlocksRef,
    recordEditRef,
  };
}
