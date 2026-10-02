import {
  findBlockById,
  subtreeIds,
  type Block,
  type BlockRect,
} from '@kometio/shared-types';
import { locateBlock, siblingsAt } from './use-block-tree';

export interface ContainerDropTarget {
  /** The container the block would land in. */
  parentId: string;
  /** Its position among that container's children, the dragged block excluded — passable straight to `handleReparent`. */
  index: number;
  /** Where the indicator line is drawn, in the same iframe-relative unit as the incoming rects. */
  indicatorTop: number;
  /** The indicator spans the container, not the page: a drop INTO something has to look different from a drop between two blocks. */
  indicatorLeft: number;
  indicatorWidth: number;
}

export interface ContainerDropOptions {
  isContainerType: (type: string) => boolean;
  canContain: (parentType: string, childType: string) => boolean;
}

/**
 * Dragging a block INTO a container, on the canvas itself.
 *
 * Until now a drag on the canvas could only reorder a block among the
 * siblings it already had (`computeDropTarget`): to put a block inside a
 * Columns or a Section you had to go through the Layers panel, which has
 * done this since Fase 7. This is the same gesture where the page is.
 *
 * The container is found by hit-testing the pointer against the rects the
 * iframe already reports for EVERY block, nested ones included — the
 * deepest one wins, so dropping into a column inside a section does not
 * land in the section. `null` means "not a drop into anything": the
 * caller falls back to reordering among siblings.
 *
 * Three refusals, the same ones the Layers panel makes
 * (`computeReparent`), because they are the ways this breaks a page and
 * not niceties:
 *  - into its own subtree, which would detach the block and everything
 *    under it from the tree;
 *  - into a container that does not accept the type;
 *  - into the parent it already has, which is a reorder and belongs to
 *    the other computation — two answers to one gesture is how they start
 *    disagreeing.
 */
export function computeContainerDrop(
  blocks: Block[],
  blockRects: BlockRect[],
  draggedBlockId: string,
  pointer: { x: number; y: number },
  options: ContainerDropOptions,
): ContainerDropTarget | null {
  const dragged = findBlockById(blocks, draggedBlockId);
  if (!dragged) {
    return null;
  }
  const forbidden = subtreeIds(blocks, draggedBlockId);
  const currentParentId = locateBlock(blocks, draggedBlockId)?.parentId ?? null;

  /*
   * The innermost container under the pointer, eligible or not — and then
   * judged. Skipping an ineligible one and answering with its parent
   * instead would move a block the person was only dragging WITHIN its own
   * column out of it, which is the opposite of what the gesture said.
   */
  const container = deepestContainerAt(
    blocks,
    blockRects,
    pointer,
    options.isContainerType,
  );
  if (
    !container?.id ||
    forbidden.has(container.id) ||
    container.id === currentParentId ||
    !options.canContain(container.type, dragged.type)
  ) {
    return null;
  }

  const containerRect = blockRects.find((rect) => rect.id === container.id);
  if (!containerRect) {
    return null;
  }
  const children = siblingsAt(blocks, container.id).filter(
    (child) => child.id !== draggedBlockId,
  );
  const childRects = children.flatMap((child) => {
    const rect = child.id
      ? blockRects.find((candidate) => candidate.id === child.id)
      : undefined;
    return rect ? [rect] : [];
  });

  // The same midpoint rule the sibling computation uses: once a child's
  // middle is passed, the drop moves beyond it.
  const index = childRects.filter(
    (rect) => pointer.y > rect.top + rect.height / 2,
  ).length;
  const before = childRects[index];
  const after = childRects[index - 1];
  const indicatorTop = before
    ? before.top
    : after
      ? after.top + after.height
      : // An empty container has no child to aim between: the line sits at
        // its top edge, which is where the first block would go.
        containerRect.top;

  return {
    parentId: container.id,
    index,
    indicatorTop,
    indicatorLeft: containerRect.left,
    indicatorWidth: containerRect.width,
  };
}

/**
 * The innermost container whose box holds the pointer — depth first, so a
 * column inside a section answers before the section does. Whether the
 * block may go in there is the caller's judgement, not this walk's.
 */
function deepestContainerAt(
  blocks: Block[],
  blockRects: BlockRect[],
  pointer: { x: number; y: number },
  isContainerType: (type: string) => boolean,
): Block | null {
  let deepest: Block | null = null;
  const walk = (candidates: Block[]) => {
    for (const block of candidates) {
      if (!block.id) continue;
      const rect = blockRects.find((candidate) => candidate.id === block.id);
      if (!rect || !holds(rect, pointer)) continue;
      if (isContainerType(block.type)) {
        deepest = block;
      }
      walk(block.children ?? []);
    }
  };
  walk(blocks);
  return deepest;
}

function holds(rect: BlockRect, pointer: { x: number; y: number }): boolean {
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  );
}
