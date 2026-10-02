import type { Dispatch, SetStateAction } from 'react';
import type { Block, BlockAlign } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import type {
  BlockTreeBridge,
  BlockTreeContext,
} from './block-tree-mutation-types';
import type { IdentifiedBlock } from './use-block-tree';
import type { BlockTreeTarget } from './use-block-tree';
import { useBlockEdits } from './use-block-edits';
import { useBlockHistory } from './use-block-history';
import { useBlockInsertion } from './use-block-insertion';
import { useCanvasFragmentSync } from './use-canvas-fragment-sync';

export interface UseBlockTreeMutationsParams {
  localBlocks: Block[];
  setLocalBlocks: Dispatch<SetStateAction<Block[]>>;
  onChange: (blocks: Block[]) => void;
  registry: BlockDescriptor[];
  bridge: BlockTreeBridge;
  token: string | null;
  pageId: string;
  /** Set only by the reusable-section editor (docs/adr/0059) — the fragment endpoint then validates the token against the section rather than a page. */
  fragmentSection?: { sectionId: string; locale: string };
  /** Remounts the canvas iframe — used where no fragment can be patched in (docs/adr/0059). */
  reloadCanvas?: () => void;
  /** Resolves when the queued draft saves have landed — awaited before asking the server to render a block whose content it holds. */
  whenSaved?: () => Promise<void>;
  /**
   * Told when a block was refused everywhere it could have gone — a Column
   * pasted with nothing but the page around it, say. Without it the block
   * would simply not appear, with nothing saying why.
   */
  onPlacementRefused?: (blockTypes: string[]) => void;
  /**
   * Sends the editor's block style sheet again, built from the tree given.
   * A block's own style is a rule keyed by its id, not something its
   * fragment carries, so a copy with a fresh id shows up plain without it.
   */
  refreshStyleSheet?: (blocks: Block[]) => void;
  selectedBlock: Block | null;
  selectedDescriptor: BlockDescriptor | undefined;
  /**
   * Whether the page in the canvas listens (the bridge's `isReady`). Every
   * change here reaches the canvas as a message, and one sent before the
   * page listens is lost: the change is saved, but not drawn until a
   * reload. So none is taken until then.
   */
  canvasReady: boolean;
}

export interface UseBlockTreeMutationsResult {
  handleInsert: (descriptor: BlockDescriptor) => void;
  /** A whole strip at once — how a template lands on the page (docs/adr/0059). */
  handleInsertBlocks: (blocks: IdentifiedBlock[]) => void;
  /** Inserts a copy beside the selection — see the implementation on why the ids change. */
  handlePaste: (block: Block) => void;
  /** Moves a block under a different parent, keeping its id, style and text. */
  handleReparent: (
    blockId: string,
    parentId: string | null,
    index: number,
  ) => void;
  /** Pastes a whole clipboard in one history entry (Fase 7). */
  handlePasteMany: (blocks: Block[]) => void;
  /** Removes a whole selection in one history entry (Fase 7). */
  handleRemoveMany: (blockIds: string[]) => void;
  /** Duplicates a whole selection in one history entry (Fase 7). */
  handleDuplicateMany: (blockIds: string[]) => void;
  handleReorder: (parentId: string | null, orderedIds: string[]) => void;
  handleRemoveSelected: () => void;
  /** Swaps the selected block for another at the same place — see the implementation. */
  handleReplaceSelected: (replacement: IdentifiedBlock) => void;
  /** Adds a strip of blocks at the end of the page, as one action — how a generated page is added. */
  handleAppendBlocks: (blocks: IdentifiedBlock[]) => void;
  /** Replaces the whole page with these blocks, as one action that undo takes back. */
  handleReplaceAll: (blocks: IdentifiedBlock[]) => void;
  handleMoveSelected: (direction: -1 | 1) => void;
  /** How much of the page's width the selected ROOT block claims (ADR-0049). */
  handleAlignSelected: (align: BlockAlign | undefined) => void;
  handleDuplicateSelected: () => void;
  handleAddChild: () => void;
  handleInsertAtRoot: (descriptor: BlockDescriptor, offset: 0 | 1) => void;
  /** Reused by use-sidebar-drag.ts for a drop at an arbitrary point on the canvas — the same mechanism as every other insert here, only with a target the caller already computed rather than one from resolveInsertTarget or a selected position. */
  insertNewBlockAt: (
    descriptor: BlockDescriptor,
    target: BlockTreeTarget,
  ) => void;
  /** Whether a block of this type has anywhere to go right now — what the picker asks before offering it. */
  canInsertType: (blockType: string) => boolean;
  /**
   * Records an edit that changed a block's props or its per-instance style
   * rather than the shape of the tree — a typed character, a field in the
   * Inspector, a colour in the style popover.
   *
   * Separate from the handlers above because those OWN their mutation: they
   * compute the new tree and apply it. This one is told about a change that
   * already happened elsewhere (canvas-editor-shell.tsx, which owns
   * `localBlocks` for these paths), so it only has to build the entry.
   *
   * The caller decides the boundary, and the boundary is the debounce burst
   * (see usePropertyPatch's onBurstEnd): one entry per run of typing, not
   * one per keystroke, which would make undo useless. It passes only the
   * tree it ended up with — what to go BACK to is `lastCommittedRef`, which
   * the history maintains itself.
   */
  recordEdit: (blockId: string, after: Block[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Move/duplicate/delete/insert a block, with undo and redo — the most
 * entangled of the three pieces extracted from canvas-editor-shell.tsx
 * (bridge + token + localBlocks all three at once), which is why it was the
 * last to be isolated rather than the first.
 *
 * It composes four parts that each do one thing, over the same tree:
 * `useBlockHistory` (the undo stacks), `useCanvasFragmentSync` (keeping the
 * live canvas in step, asynchronously), `useBlockInsertion` (everything
 * that adds blocks) and `useBlockEdits` (everything that changes blocks
 * already there). It is the only place that already sees EVERY structural
 * mutation of the tree, and therefore where undo/redo is intercepted rather
 * than in a fifth separate hook.
 */
export function useBlockTreeMutations({
  localBlocks,
  setLocalBlocks,
  onChange,
  registry,
  bridge,
  token,
  pageId,
  fragmentSection,
  reloadCanvas,
  whenSaved,
  refreshStyleSheet,
  onPlacementRefused,
  selectedBlock,
  selectedDescriptor,
  canvasReady,
}: UseBlockTreeMutationsParams): UseBlockTreeMutationsResult {
  /**
   * Every change of the tree goes through here, undo and redo included —
   * which is why the style sheet is refreshed here and not in the handlers
   * that happen to add a styled block: whichever path brings an instance
   * back, its rule comes with it.
   */
  function applyLocalChange(next: Block[]): void {
    setLocalBlocks(next);
    onChange(next);
    refreshStyleSheet?.(next);
  }

  const history = useBlockHistory({ pageId, localBlocks, applyLocalChange });
  const canvas = useCanvasFragmentSync({
    localBlocks,
    registry,
    bridge,
    token,
    pageId,
    fragmentSection,
    reloadCanvas,
    whenSaved,
  });
  const context: BlockTreeContext = {
    localBlocks,
    registry,
    bridge,
    selectedBlock,
    reloadCanvas,
    applyLocalChange,
    recordHistory: history.recordHistory,
    canvas,
  };
  const insertion = useBlockInsertion({
    ...context,
    selectedDescriptor,
    onPlacementRefused,
  });
  const edits = useBlockEdits(context);

  function recordEdit(blockId: string, after: Block[]): void {
    const before = history.lastCommittedRef.current;
    if (before === after) {
      return;
    }
    history.recordHistory({
      before,
      after,
      syncForward: () => canvas.patchBlockFromTree(after, blockId),
      syncBackward: () => canvas.patchBlockFromTree(before, blockId),
    });
  }

  /*
   * A change asked for while the canvas loads is not taken, whichever way
   * it was asked for: the palette, a shortcut (a paste — the clipboard
   * outlives a change of page), the Layers menu, undo. The palette and the
   * panels say so on screen; this is the one place every path goes
   * through.
   *
   * Closures written out here rather than a helper that wraps each
   * handler: the React Compiler's lint reads a handler passed to a
   * function during render as one that may run during render, and these
   * read refs.
   */
  return {
    recordEdit,
    canInsertType: insertion.canInsertType,
    handleInsert: (...args) => {
      if (canvasReady) insertion.handleInsert(...args);
    },
    handleInsertBlocks: (...args) => {
      if (canvasReady) insertion.handleInsertBlocks(...args);
    },
    handlePaste: (...args) => {
      if (canvasReady) insertion.handlePaste(...args);
    },
    handleReparent: (...args) => {
      if (canvasReady) edits.handleReparent(...args);
    },
    handlePasteMany: (...args) => {
      if (canvasReady) insertion.handlePasteMany(...args);
    },
    handleRemoveMany: (...args) => {
      if (canvasReady) edits.handleRemoveMany(...args);
    },
    handleDuplicateMany: (...args) => {
      if (canvasReady) insertion.handleDuplicateMany(...args);
    },
    handleReplaceSelected: (...args) => {
      if (canvasReady) edits.handleReplaceSelected(...args);
    },
    handleAppendBlocks: (...args) => {
      if (canvasReady) insertion.handleAppendBlocks(...args);
    },
    handleReplaceAll: (...args) => {
      if (canvasReady) edits.handleReplaceAll(...args);
    },
    handleReorder: (...args) => {
      if (canvasReady) edits.handleReorder(...args);
    },
    handleRemoveSelected: (...args) => {
      if (canvasReady) edits.handleRemoveSelected(...args);
    },
    handleMoveSelected: (...args) => {
      if (canvasReady) edits.handleMoveSelected(...args);
    },
    handleAlignSelected: (...args) => {
      if (canvasReady) edits.handleAlignSelected(...args);
    },
    handleDuplicateSelected: (...args) => {
      if (canvasReady) insertion.handleDuplicateSelected(...args);
    },
    handleAddChild: (...args) => {
      if (canvasReady) insertion.handleAddChild(...args);
    },
    handleInsertAtRoot: (...args) => {
      if (canvasReady) insertion.handleInsertAtRoot(...args);
    },
    insertNewBlockAt: (...args) => {
      if (canvasReady) insertion.insertNewBlockAt(...args);
    },
    undo: (...args) => {
      if (canvasReady) history.undo(...args);
    },
    redo: (...args) => {
      if (canvasReady) history.redo(...args);
    },
    canUndo: canvasReady && history.canUndo,
    canRedo: canvasReady && history.canRedo,
  };
}
