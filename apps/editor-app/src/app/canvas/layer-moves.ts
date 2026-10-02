import { arrayMove } from '@dnd-kit/sortable';
import { findBlockById, subtreeIds, type Block } from '@kometio/shared-types';
import { blockIds, locateBlock, siblingsAt } from './use-block-tree';

/*
 * What a drop in the Layers panel means, as plain functions of the tree:
 * a reorder among siblings, or a move under another parent. Kept out of
 * the panel's component so they are tested without simulating a drag.
 */

/**
 * Isolated so it can be tested without simulating a real dnd-kit drag
 * (pointer events plus DOM measurement) in jsdom. `null` = a drop with no
 * effect (no target, the same position, an unknown id, OR a drop between
 * siblings of different parents — that one is a reparent, answered by
 * `computeReparent` below, never by both). `locateBlock`/`siblingsAt`
 * (already used by move up/down and duplicate for the same problem) find
 * the real parent and the real siblings at any depth, root included
 * (`parentId: null`).
 */
export function computeNestedReorder(
  blocks: Block[],
  activeId: string,
  overId: string | null,
): { parentId: string | null; orderedIds: string[] } | null {
  if (!overId || activeId === overId) {
    return null;
  }
  const activeLocation = locateBlock(blocks, activeId);
  const overLocation = locateBlock(blocks, overId);
  if (!activeLocation || !overLocation) {
    return null;
  }
  if (activeLocation.parentId !== overLocation.parentId) {
    return null;
  }

  const siblingIds = blockIds(siblingsAt(blocks, activeLocation.parentId));
  const oldIndex = siblingIds.indexOf(activeId);
  const newIndex = siblingIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) {
    return null;
  }

  return {
    parentId: activeLocation.parentId,
    orderedIds: arrayMove(siblingIds, oldIndex, newIndex),
  };
}

/**
 * Where a cross-parent drop actually lands, or `null` when it must not
 * happen (Fase 7).
 *
 * Dropping ONTO a container's own row means "put it inside", at the end —
 * that is the only way to reach an empty container, which has no child row
 * to aim between. Dropping onto an ordinary row means "become its
 * sibling", at that row's position.
 *
 * Three refusals, and each is a real way to break a page rather than a
 * nicety:
 *  - into its own subtree, which would detach the block from the tree
 *    and lose everything under it;
 *  - into a container that does not accept that type (`canContain`), the
 *    same rule the drag-from-sidebar path already honours;
 *  - a drop whose parent is unchanged, which is a REORDER and belongs to
 *    `computeNestedReorder` — answering it here too would give one gesture
 *    two implementations.
 */
export function computeReparent(
  blocks: Block[],
  activeId: string,
  overId: string | null,
  options: {
    isContainerType: (type: string) => boolean;
    canContain: (parentType: string, childType: string) => boolean;
  },
): { blockId: string; parentId: string | null; index: number } | null {
  if (!overId || activeId === overId) {
    return null;
  }
  const active = findBlockById(blocks, activeId);
  const over = findBlockById(blocks, overId);
  const activeLocation = locateBlock(blocks, activeId);
  const overLocation = locateBlock(blocks, overId);
  if (!active || !over || !activeLocation || !overLocation) {
    return null;
  }
  if (subtreeIds(blocks, activeId).has(overId)) {
    return null;
  }

  // Onto a container's own row: inside it, at the end.
  if (options.isContainerType(over.type)) {
    if (
      overLocation.parentId === activeId ||
      !options.canContain(over.type, active.type)
    ) {
      return null;
    }
    if (activeLocation.parentId === overId) {
      return null;
    }
    return {
      blockId: activeId,
      parentId: overId,
      index: over.children?.length ?? 0,
    };
  }

  // Onto an ordinary row: beside it.
  if (activeLocation.parentId === overLocation.parentId) {
    return null;
  }
  const newParent = overLocation.parentId
    ? findBlockById(blocks, overLocation.parentId)
    : null;
  if (newParent && !options.canContain(newParent.type, active.type)) {
    return null;
  }
  return {
    blockId: activeId,
    parentId: overLocation.parentId,
    index: overLocation.index,
  };
}
