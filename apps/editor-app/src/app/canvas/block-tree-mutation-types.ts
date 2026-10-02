import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { PreviewBridgeState } from './use-preview-bridge';
import type { IdentifiedBlock } from './use-block-tree';

/**
 * One undoable action — `before`/`after` for restoring local state
 * (identical for every kind of mutation), `syncForward`/`syncBackward` for
 * redoing/undoing its EFFECT ON THE LIVE CANVAS, which is type-specific: an
 * insert is undone by removing, a removal by reinserting, a move by moving
 * to the opposite index — the bridge's three primitives
 * (`insertBlock`/`removeBlock`/`reorderBlocks`+`patchBlock`) are not
 * symmetric with each other, so there is no single "generic opposite": each
 * handler builds its own pair.
 */
export interface HistoryEntry {
  before: Block[];
  after: Block[];
  syncForward: () => void;
  syncBackward: () => void;
}

/** What the mutations ask of the preview bridge. */
export type BlockTreeBridge = Pick<
  PreviewBridgeState,
  | 'selectedBlockId'
  | 'patchBlock'
  | 'insertBlock'
  | 'removeBlock'
  | 'reorderBlocks'
  | 'setRootLayout'
>;

/**
 * What every family of tree mutations works from: the tree as this render
 * has it, how a new one becomes the page's, how the change is recorded for
 * undo, and how it reaches the canvas.
 */
export interface BlockTreeContext {
  localBlocks: Block[];
  registry: BlockDescriptor[];
  bridge: BlockTreeBridge;
  selectedBlock: Block | null;
  /** Remounts the canvas iframe — used where no fragment can be patched in (docs/adr/0059). */
  reloadCanvas?: () => void;
  applyLocalChange: (next: Block[]) => void;
  recordHistory: (entry: HistoryEntry) => void;
  canvas: CanvasFragmentSync;
}

/** The fragments the canvas is kept in step with, and the turns that keep a late one from landing (see useCanvasFragmentSync). */
export interface CanvasFragmentSync {
  patchParentBlock: (
    parentId: string,
    treeWithUpdatedChildren: Block[],
  ) => Promise<void>;
  insertBlocksIntoCanvasAt: (
    blocks: IdentifiedBlock[],
    parentId: string | null,
    beforeBlockId: string | null,
    isCurrent?: () => boolean,
  ) => Promise<void>;
  insertBlockIntoCanvasAt: (
    block: IdentifiedBlock,
    parentId: string | null,
    beforeBlockId: string | null,
    isCurrent?: () => boolean,
  ) => Promise<void>;
  patchBlockFromTree: (tree: Block[], blockId: string) => void;
}
