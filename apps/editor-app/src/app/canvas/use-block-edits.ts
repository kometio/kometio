import {
  rootBlockHoverAttr,
  type Block,
  type BlockAlign,
  findBlockById,
} from '@kometio/shared-types';
import {
  blockIds,
  hasId,
  insertBlock,
  locateBlock,
  moveBlock,
  removeBlock,
  siblingsAt,
  updateBlockAlign,
  type BlockTreeTarget,
  type IdentifiedBlock,
} from './use-block-tree';
import type { BlockTreeContext } from './block-tree-mutation-types';
import { syncTurns } from './use-canvas-fragment-sync';

/**
 * Everything that CHANGES blocks already on the page: reorder, move,
 * reparent, replace, remove, align. Each computes the next tree, applies it
 * and records an entry whose two sync functions know how to redo and undo
 * the change on the canvas.
 */
export function useBlockEdits({
  localBlocks,
  bridge,
  selectedBlock,
  reloadCanvas,
  applyLocalChange,
  recordHistory,
  canvas: { patchParentBlock, insertBlockIntoCanvasAt },
}: BlockTreeContext) {
  function handleReorder(parentId: string | null, orderedIds: string[]): void {
    const before = localBlocks;
    let next = before;
    orderedIds.forEach((id, index) => {
      next = moveBlock(next, id, { parentId, index });
    });
    applyLocalChange(next);
    const beforeSiblingIds = blockIds(siblingsAt(before, parentId));
    const syncForward = () => bridge.reorderBlocks(parentId, orderedIds);
    const syncBackward = () => bridge.reorderBlocks(parentId, beforeSiblingIds);
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  /**
   * Swaps the selected block for another one at the same place — how a
   * block becomes a reusable section (docs/adr/0059): the section is
   * created from its content, and the block it was made from is replaced
   * by an instance pointing at it.
   *
   * Remove then insert at the ORIGINAL index, in one history entry: two
   * separate mutations would mean an undo that leaves the page with
   * neither the block nor the section, which is the state nobody asked
   * for.
   */
  function handleReplaceSelected(replacement: IdentifiedBlock): void {
    if (!selectedBlock?.id) {
      return;
    }
    const location = locateBlock(localBlocks, selectedBlock.id);
    if (!location) {
      return;
    }
    const before = localBlocks;
    const target: BlockTreeTarget = {
      parentId: location.parentId,
      index: location.index,
    };
    const next = insertBlock(
      removeBlock(before, selectedBlock.id),
      replacement,
      target,
    );
    applyLocalChange(next);
    // A full reload of the canvas rather than a surgical patch: the
    // replacement renders a section, whose blocks the client does not
    // have, so there is no fragment to graft in place of the old node.
    // A full reload rather than a surgical patch, both ways: what replaces
    // the block renders a SECTION, whose blocks live on the server and are
    // resolved at read time — there is no fragment the client could graft
    // in its place.
    const syncForward = () => reloadCanvas?.();
    const syncBackward = () => reloadCanvas?.();
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  /**
   * Replaces every block of the page in one entry. The canvas is reloaded
   * both ways rather than patched: every node on it goes, and a patch per
   * block would be the whole page rendered one fragment at a time.
   */
  function handleReplaceAll(blocks: IdentifiedBlock[]): void {
    const before = localBlocks;
    const next: Block[] = blocks;
    applyLocalChange(next);
    const syncForward = () => reloadCanvas?.();
    const syncBackward = () => reloadCanvas?.();
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  function handleRemoveSelected(): void {
    if (!hasId(selectedBlock)) {
      return;
    }
    const location = locateBlock(localBlocks, selectedBlock.id);
    const before = localBlocks;
    const removedBlock = selectedBlock;
    const next = removeBlock(before, selectedBlock.id);
    applyLocalChange(next);
    // A removed nested block can change its parent's "chrome" (Testimonials
    // hides the nav buttons again and shows the empty placeholder once more
    // when it loses its last child, say) — the same reason a nested insert
    // re-patches the parent rather than touching only the removed node. A
    // top-level block stays a plain editor:remove-block instead.
    //
    // Turns, like every other entry: undo and redo can both land while a
    // fragment is still rendering, and the block would then be grafted back
    // after the redo had already removed it.
    const takeTurn = syncTurns();
    const syncForward = () => {
      // The turn is taken and not read: what it does here is make a graft
      // still on its way from an undo stale, so the block cannot come back
      // after this removal put it away again.
      takeTurn();
      if (location?.parentId) {
        void patchParentBlock(location.parentId, next);
      } else {
        bridge.removeBlock(removedBlock.id);
      }
    };
    const syncBackward = () => {
      const isCurrent = takeTurn();
      if (!location) {
        return;
      }
      if (location.parentId) {
        void patchParentBlock(location.parentId, before);
      } else {
        // Reinserts at the ORIGINAL position — the next sibling is not
        // recomputed from `localBlocks`, no longer `before` by the time of
        // a later redo: the real next sibling has to be taken here, straight from
        // `before`, the snapshot of the tree at the moment of the original
        // removal.
        const siblingsBefore = siblingsAt(before, null);
        const beforeBlockId = siblingsBefore[location.index + 1]?.id ?? null;
        void insertBlockIntoCanvasAt(
          removedBlock,
          null,
          beforeBlockId,
          isCurrent,
        );
      }
    };
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  // Move up/down and duplicate — they work at any level through
  // `locateBlock`, which finds the real parent even for a nested block.
  function handleMoveSelected(direction: -1 | 1): void {
    if (!selectedBlock?.id) {
      return;
    }
    const location = locateBlock(localBlocks, selectedBlock.id);
    if (!location) {
      return;
    }
    const siblings = location.parentId
      ? (findBlockById(localBlocks, location.parentId)?.children ?? [])
      : localBlocks;
    const targetIndex = location.index + direction;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }
    const before = localBlocks;
    const next = moveBlock(before, selectedBlock.id, {
      parentId: location.parentId,
      index: targetIndex,
    });
    applyLocalChange(next);
    const syncForward = () => {
      if (location.parentId) {
        void patchParentBlock(location.parentId, next);
      } else {
        bridge.reorderBlocks(null, blockIds(next));
      }
    };
    const syncBackward = () => {
      if (location.parentId) {
        void patchParentBlock(location.parentId, before);
      } else {
        bridge.reorderBlocks(null, blockIds(before));
      }
    };
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  /**
   * How much of the page's width the selected ROOT block claims (ADR-0049).
   *
   * No render round trip: the value ends up as an attribute on the wrapper
   * AROUND the block, so re-rendering the block's own HTML would not carry
   * it. The bridge sets that attribute directly and the CSS reflows the
   * canvas with nothing to wait for.
   *
   * It goes through the history like every other change of the tree. It
   * used to be applied and saved on its own, so the next recorded edit
   * carried the alignment back to what it was in its `before`, and undoing
   * that edit put the old value in the tree while the canvas kept showing
   * the new one.
   */
  function handleAlignSelected(align: BlockAlign | undefined): void {
    if (!hasId(selectedBlock)) {
      return;
    }
    const blockId = selectedBlock.id;
    const previous = selectedBlock.align;
    const before = localBlocks;
    const next = updateBlockAlign(before, blockId, align);
    applyLocalChange(next);
    const hover = rootBlockHoverAttr(selectedBlock.styleOverride) ?? null;
    const syncForward = () =>
      bridge.setRootLayout(blockId, align ?? null, hover);
    const syncBackward = () =>
      bridge.setRootLayout(blockId, previous ?? null, hover);
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  /**
   * Removes every selected block in one step (Fase 7).
   *
   * One history entry for the whole set, not one per block: somebody who
   * selected four things and pressed Delete asked for one action, and four
   * undos to get back would be four surprises.
   *
   * A canvas reload rather than four surgical patches: the blocks can sit
   * under different parents, so the patches would be a set of parent
   * re-renders computed from a tree that is changing underneath them.
   */
  function handleRemoveMany(blockIds: string[]): void {
    if (blockIds.length === 0) {
      return;
    }
    // One block keeps the surgical path — it is the common case, and
    // reloading the canvas for it would be a visible flash where there
    // never used to be one.
    if (blockIds.length === 1 && blockIds[0] === selectedBlock?.id) {
      handleRemoveSelected();
      return;
    }
    const before = localBlocks;
    const next = blockIds.reduce(
      (tree, blockId) => removeBlock(tree, blockId),
      before,
    );
    applyLocalChange(next);
    const sync = () => reloadCanvas?.();
    sync();
    recordHistory({
      before,
      after: next,
      syncForward: sync,
      syncBackward: sync,
    });
  }

  /**
   * Moves a block under a different parent, keeping the block itself
   * intact (Fase 7).
   *
   * Until now this was impossible: the Layers panel refused a cross-parent
   * drop, so getting a block into a Column meant deleting it and building
   * it again in place — losing its per-instance styling, its variant and
   * its text. This moves the same block, with the same id, so all three
   * survive.
   *
   * One history entry, like the swap in `handleReplaceSelected`: an undo
   * that put the block back but left the hole open would be a state
   * nobody asked for.
   */
  function handleReparent(
    blockId: string,
    parentId: string | null,
    index: number,
  ): void {
    const before = localBlocks;
    const block = findBlockById(before, blockId);
    const from = locateBlock(before, blockId);
    if (!hasId(block) || !from) {
      return;
    }
    const to: BlockTreeTarget = { parentId, index };
    const next = insertBlock(removeBlock(before, blockId), block, to);
    applyLocalChange(next);
    // Both ends of the move have to be re-rendered, and the fragments
    // involved are the two PARENTS rather than the block: a container
    // shows different chrome when it gains or loses a child (an empty-state
    // hint appearing, a collection's arrows), which patching only the moved
    // node would leave stale. At the root there is no parent fragment, so
    // the block itself is removed or grafted in.
    //
    // Each direction takes the block OUT of where it was in the tree it
    // leaves and puts it IN where it is in the tree it arrives at. Undo used
    // to replay the forward steps against the old tree, so a block moved
    // from the root into a container was removed from the canvas instead of
    // coming back.
    const takeTurn = syncTurns();
    const move =
      (
        out: { parentId: string | null },
        into: BlockTreeTarget,
        arrivingTree: Block[],
      ) =>
      () => {
        const isCurrent = takeTurn();
        if (out.parentId) {
          void patchParentBlock(out.parentId, arrivingTree);
        } else {
          bridge.removeBlock(blockId);
        }
        if (into.parentId) {
          void patchParentBlock(into.parentId, arrivingTree);
        } else {
          const beforeBlockId =
            siblingsAt(arrivingTree, null)[into.index + 1]?.id ?? null;
          void insertBlockIntoCanvasAt(block, null, beforeBlockId, isCurrent);
        }
      };
    const syncForward = move(from, to, next);
    const syncBackward = move(to, from, before);
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  return {
    handleReorder,
    handleReplaceSelected,
    handleReplaceAll,
    handleRemoveSelected,
    handleMoveSelected,
    handleAlignSelected,
    handleRemoveMany,
    handleReparent,
  };
}
