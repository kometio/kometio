import { type Block, findBlockById } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  cloneBlockWithNewIds,
  createBlockFromDescriptor,
  insertBlock,
  locateBlock,
  nearestTargetThatHolds,
  siblingsAt,
  type BlockTreeTarget,
  type IdentifiedBlock,
} from './use-block-tree';
import type { BlockTreeContext } from './block-tree-mutation-types';
import { syncTurns } from './use-canvas-fragment-sync';

/** At the root when the selected block is not a container, otherwise at the end of its children — the "selected container or root" rule from the visual editor plan, Day 3. */
function resolveInsertTarget(
  blocks: Block[],
  registry: BlockDescriptor[],
  selectedBlockId: string | null,
): BlockTreeTarget {
  if (selectedBlockId) {
    const selected = findBlockById(blocks, selectedBlockId);
    const descriptor = selected
      ? registry.find((d) => d.type === selected.type)
      : undefined;
    if (selected && descriptor?.isContainer) {
      return {
        parentId: selected.id ?? null,
        index: selected.children?.length ?? 0,
      };
    }
  }
  return { parentId: null, index: blocks.length };
}

/**
 * Everything that ADDS blocks: from the picker, a paste, a template, a
 * generated page, a duplicate, a drop. `insertManyAt` is the shared core of
 * every one of them (previously four nearly identical copies of
 * insertBlock + applyLocalChange + a canvas insert in the original file).
 */
export function useBlockInsertion({
  localBlocks,
  registry,
  bridge,
  selectedBlock,
  selectedDescriptor,
  onPlacementRefused,
  reloadCanvas,
  applyLocalChange,
  recordHistory,
  canvas: { patchParentBlock, insertBlocksIntoCanvasAt },
}: BlockTreeContext & {
  selectedDescriptor: BlockDescriptor | undefined;
  /**
   * Told when a block was refused everywhere it could have gone — a Column
   * pasted with nothing but the page around it, say. Without it the block
   * would simply not appear, with nothing saying why.
   */
  onPlacementRefused?: (blockTypes: string[]) => void;
}) {
  /**
   * Renders the fragment of the block JUST created (never seen before by
   * the iframe, unlike usePropertyPatch, which replaces an existing one)
   * and inserts it into the canvas through `editor:insert-block` — without
   * this, the block would stay in the local tree and the saved draft but
   * remain invisible until the iframe reloaded (the reported bug). The
   * block's `children` are already known here (just built or cloned), so
   * there is no need for the server to read them back from the saved draft
   * — which also avoids the save/read race for a container. `beforeBlockId`
   * is computed BEFORE the insert is applied to the tree: it is the id of
   * whoever occupies the target position today, and who will be shifted by
   * one after the insert.
   *
   * For a NESTED insert (`target.parentId` non-null) see `patchParentBlock`
   * above — the parent is re-patched, the child is not inserted on its own.
   */
  function performInsert(
    block: IdentifiedBlock,
    target: BlockTreeTarget,
  ): void {
    insertManyAt([block], target);
  }

  /**
   * Where these types may go from the target aimed at, or `null` when
   * nowhere will have them — and then whoever asked is told, so a refusal
   * is a message rather than a block that never appears.
   */
  function placementFor(
    target: BlockTreeTarget,
    blockTypes: string[],
  ): BlockTreeTarget | null {
    const placed = nearestTargetThatHolds(
      localBlocks,
      registry,
      target,
      blockTypes,
    );
    if (!placed) {
      onPlacementRefused?.(blockTypes);
    }
    return placed;
  }

  /** The target a click in the picker aims at, before asking whether it holds. */
  function selectedInsertTarget(): BlockTreeTarget {
    return resolveInsertTarget(localBlocks, registry, bridge.selectedBlockId);
  }

  function canInsertType(blockType: string): boolean {
    return (
      nearestTargetThatHolds(localBlocks, registry, selectedInsertTarget(), [
        blockType,
      ]) !== null
    );
  }

  function handleInsert(descriptor: BlockDescriptor): void {
    const target = placementFor(selectedInsertTarget(), [descriptor.type]);
    if (!target) {
      return;
    }
    performInsert(createBlockFromDescriptor(descriptor, registry), target);
  }

  /**
   * Inserts a whole strip of blocks — how a TEMPLATE arrives (docs/adr/0059).
   *
   * Several blocks go in as ONE operation: they used to be a loop over
   * `performInsert`, and each call read the tree from the render it was
   * created in, so every block after the first started from a tree that
   * never had the ones before it. A template of three blocks landed as its
   * last block alone — and cost three undos to take back. The same trap
   * `handlePasteMany` documents, and now the same fix.
   *
   * The strip travels together, so it goes where EVERY block in it may sit
   * — not split between a container and the level above it.
   */
  function handleInsertBlocks(blocks: IdentifiedBlock[]): void {
    if (blocks.length === 0) {
      return;
    }
    const target = placementFor(
      selectedInsertTarget(),
      blocks.map((block) => block.type),
    );
    if (!target) {
      return;
    }
    insertManyAt(blocks, target);
  }

  /**
   * Blocks inserted side by side as one action — one tree write, one save,
   * one undo — built in a loop over the same growing tree rather than over
   * the render's own copy, which is the whole point. One block is simply
   * the shortest strip: every insert in this file ends up here.
   *
   * Patched into the canvas in place. A strip used to reload the iframe,
   * which threw the page back to the top and could show the draft from
   * before the insert if its save had not landed yet.
   *
   * `beforeBlockId` is the id of whoever occupies the target position
   * today, taken from `before` once: every block is grafted in front of
   * that same one, so a later redo does not recompute it from a tree that
   * has moved on. For a NESTED insert see `patchParentBlock` — the parent
   * is re-rendered, the children are not inserted on their own.
   */
  function insertManyAt(
    blocks: IdentifiedBlock[],
    target: BlockTreeTarget,
  ): void {
    const before = localBlocks;
    let next = before;
    let index = target.index;
    for (const block of blocks) {
      next = insertBlock(next, block, { parentId: target.parentId, index });
      // Forwards, so the strip lands in the order it was written.
      index += 1;
    }
    applyLocalChange(next);
    const parentId = target.parentId;
    const beforeBlockId = siblingsAt(before, null)[target.index]?.id ?? null;
    const takeTurn = syncTurns();
    const syncForward = () => {
      const isCurrent = takeTurn();
      void (parentId
        ? patchParentBlock(parentId, next)
        : insertBlocksIntoCanvasAt(blocks, null, beforeBlockId, isCurrent));
    };
    const syncBackward = () => {
      // Taken and not read, like the forward one: what it does is make a
      // graft still on its way stale, so an undone strip cannot land after
      // it was taken back.
      takeTurn();
      if (parentId) {
        void patchParentBlock(parentId, before);
        return;
      }
      for (const block of blocks) {
        bridge.removeBlock(block.id);
      }
    };
    syncForward();
    recordHistory({ before, after: next, syncForward, syncBackward });
  }

  function handleAppendBlocks(blocks: IdentifiedBlock[]): void {
    if (blocks.length === 0) {
      return;
    }
    insertManyAt(blocks, { parentId: null, index: localBlocks.length });
  }

  function handleDuplicateSelected(): void {
    if (!selectedBlock?.id) {
      return;
    }
    const location = locateBlock(localBlocks, selectedBlock.id);
    if (!location) {
      return;
    }
    performInsert(cloneBlockWithNewIds(selectedBlock), {
      parentId: location.parentId,
      index: location.index + 1,
    });
  }

  /**
   * Pastes a whole clipboard beside the selection, in one operation.
   *
   * Not a loop over `handlePaste`: each call reads the tree from the
   * render it was created in, so the second paste would start from a tree
   * that never had the first — last write wins, and one of the two blocks
   * silently disappears. Found by the test, not by reading.
   */
  function handlePasteMany(blocks: Block[]): void {
    const [first] = blocks;
    if (first === undefined) {
      return;
    }
    if (blocks.length === 1) {
      handlePaste(first);
      return;
    }
    const at = selectedBlock?.id
      ? locateBlock(localBlocks, selectedBlock.id)
      : null;
    const target = placementFor(
      at
        ? { parentId: at.parentId, index: at.index + 1 }
        : { parentId: null, index: siblingsAt(localBlocks, null).length },
      blocks.map((block) => block.type),
    );
    if (!target) {
      return;
    }
    insertManyAt(
      blocks.map((block) => cloneBlockWithNewIds(block)),
      target,
    );
  }

  /**
   * Duplicates every selected block, each right after itself. Same
   * single-entry, single-reload reasoning as `handleRemoveMany`.
   */
  function handleDuplicateMany(blockIds: string[]): void {
    if (blockIds.length <= 1) {
      handleDuplicateSelected();
      return;
    }
    const before = localBlocks;
    let next = before;
    // Right to left, so an insertion never shifts the index of a block
    // still waiting to be copied.
    const locations = blockIds
      .flatMap((blockId) => {
        const at = locateBlock(before, blockId);
        const block = findBlockById(before, blockId);
        return at && block ? [{ at, block }] : [];
      })
      .sort((a, b) => b.at.index - a.at.index);
    for (const { at, block } of locations) {
      next = insertBlock(next, cloneBlockWithNewIds(block), {
        parentId: at.parentId,
        index: at.index + 1,
      });
    }
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
   * Pastes a block beside the selected one, or at the end of the page when
   * nothing is selected.
   *
   * Fresh ids on every paste (`cloneBlockWithNewIds`, the same function
   * Duplicate uses): two pastes of one copied block must not share ids,
   * which key the per-instance style rule and the translation overlay —
   * a style set on the second copy would land on both.
   */
  function handlePaste(block: Block): void {
    const location = selectedBlock?.id
      ? locateBlock(localBlocks, selectedBlock.id)
      : null;
    const target = placementFor(
      location
        ? { parentId: location.parentId, index: location.index + 1 }
        : { parentId: null, index: localBlocks.length },
      [block.type],
    );
    if (!target) {
      return;
    }
    performInsert(cloneBlockWithNewIds(block), target);
  }

  /**
   * The "+" inside a selected collection container (Testimonials, Team,
   * Accordion, ...) — it adds another child of its ONE allowed type
   * (`allowedChildTypes[0]`) without opening the picker: there is no
   * ambiguity to ask about, that being the only sensible type for that
   * container (the same rule as createBlockFromDescriptor). The button only
   * appears when `descriptor.allowedChildTypes` has exactly one entry (see
   * block-toolbar-overlay.tsx's canAddChild), so the registry lookup here
   * should never fail — and if it somehow did (a registry out of sync),
   * simply nothing happens.
   */
  function handleAddChild(): void {
    if (!selectedBlock?.id || !selectedDescriptor) {
      return;
    }
    const childType = selectedDescriptor.allowedChildTypes?.[0];
    const childDescriptor = childType
      ? registry.find((d) => d.type === childType)
      : undefined;
    if (!childDescriptor) {
      return;
    }
    performInsert(createBlockFromDescriptor(childDescriptor, registry), {
      parentId: selectedBlock.id,
      index: selectedBlock.children?.length ?? 0,
    });
  }

  function handleInsertAtRoot(
    descriptor: BlockDescriptor,
    offset: 0 | 1,
  ): void {
    if (!selectedBlock?.id) {
      return;
    }
    const index = localBlocks.findIndex((b) => b.id === selectedBlock.id);
    if (index === -1) {
      return;
    }
    performInsert(createBlockFromDescriptor(descriptor, registry), {
      parentId: null,
      index: index + offset,
    });
  }

  function insertNewBlockAt(
    descriptor: BlockDescriptor,
    target: BlockTreeTarget,
  ): void {
    performInsert(createBlockFromDescriptor(descriptor, registry), target);
  }

  return {
    canInsertType,
    handleInsert,
    handleInsertBlocks,
    handlePaste,
    handlePasteMany,
    handleAppendBlocks,
    handleAddChild,
    handleInsertAtRoot,
    insertNewBlockAt,
    handleDuplicateSelected,
    handleDuplicateMany,
  };
}
