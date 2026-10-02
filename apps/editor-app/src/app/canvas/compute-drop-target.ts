import type { Block, BlockRect } from '@kometio/shared-types';
import { locateBlock, siblingsAt } from './use-block-tree';

export interface DropCandidateRect {
  id: string;
  top: number;
  height: number;
}

export interface DropTarget {
  /** The index at which to insert the dragged block, already computed EXCLUDING that block from the list — passable straight to `moveBlock`/`insertBlock` (use-block-tree.ts), which removes the block and then reinserts it at that position. */
  index: number;
  /** The Y (in the same unit as the incoming rects — iframe-relative) of the boundary on which to draw the drop indicator, above the block that would be pushed down, or just below the last one when dropping at the end. */
  indicatorTop: number;
}

/**
 * Direct reordering on the canvas (Day 3/4) — it computes where the dragged
 * block would land IF released now, from the pointer's vertical position
 * alone. It compares the pointer against each top-level block's MIDPOINT
 * (not its top edge): once a block's midpoint is passed, the drop moves
 * beyond that block — the same "closestCenter" heuristic dnd-kit already
 * uses in the Layers panel, applied by hand here because the drag itself is
 * not dnd-kit's (it crosses the iframe boundary, see
 * PreviewDragStartMessage).
 *
 * It assumes `rects` are already in document order (increasing top), which
 * is true by construction: they are collected by `collectBlockElements` in
 * the iframe through `querySelectorAll`, in the same order `Block[]`
 * renders them.
 *
 * `null` when no OTHER top-level block is left to compare against (the
 * dragged block is the only one on the page) — there is no sensible drop
 * position to compute.
 */
export function computeDropTarget(
  rects: DropCandidateRect[],
  draggedBlockId: string,
  pointerY: number,
): DropTarget | null {
  const others = rects.filter((rect) => rect.id !== draggedBlockId);
  const last = others[others.length - 1];
  if (last === undefined) {
    return null;
  }

  let index = 0;
  for (const rect of others) {
    const midpoint = rect.top + rect.height / 2;
    if (pointerY > midpoint) {
      index++;
    } else {
      break;
    }
  }

  // The line goes on the top edge of the block the pointer is above, or,
  // past the last one, on its bottom edge.
  const before = others[index];
  const indicatorTop = before ? before.top : last.top + last.height;

  return { index, indicatorTop };
}

export interface ContainerHitRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * A drop of a NEW block from the sidebar (reported from live use: it always
 * nested into the container that was still SELECTED, ignoring the release
 * point — if the user dragged over a container other than the previously
 * selected one, the block ended up in the wrong place with no visual
 * indication why). It returns the id of the deepest container (the smallest
 * area among those whose coordinates contain the point) — the caller
 * (use-sidebar-drag.ts) passes only rects already filtered down to
 * containers: this module knows nothing about the block registry. `null`
 * when the point falls in no container — the caller then falls back to the
 * root-level position through `computeDropTarget` above.
 */
export function findContainerAtPoint(
  containerRects: ContainerHitRect[],
  x: number,
  y: number,
): string | null {
  let best: { id: string; area: number } | null = null;
  for (const rect of containerRects) {
    const inside =
      x >= rect.left &&
      x <= rect.left + rect.width &&
      y >= rect.top &&
      y <= rect.top + rect.height;
    if (!inside) {
      continue;
    }
    const area = rect.width * rect.height;
    if (!best || area < best.area) {
      best = { id: rect.id, area };
    }
  }
  return best?.id ?? null;
}

/**
 * The rects a drop is measured against: the dragged block's real SIBLINGS,
 * at whatever depth it sits (Fase 7), and the parent they share.
 *
 * It used to be the top-level blocks and nothing else, which is why
 * dragging on the canvas was root-only — the three columns of a Columns
 * could be reordered from the Layers panel and not from the page they were
 * on. `computeDropTarget` never cared: it compares a pointer against a list
 * of rects, and the list was the whole restriction.
 *
 * In tree order and not the raw document order of `blockRects`, which
 * interleaves every depth. `null` asks for the root — a drag out of the
 * sidebar has no block in the tree yet, so it measures against the level it
 * drops at.
 */
export function siblingDropRects(
  blocks: Block[],
  blockRects: BlockRect[],
  blockId: string | null,
): { parentId: string | null; rects: DropCandidateRect[] } {
  const parentId = blockId
    ? (locateBlock(blocks, blockId)?.parentId ?? null)
    : null;
  const rects = siblingsAt(blocks, parentId).flatMap((block) => {
    if (!block.id) {
      return [];
    }
    const rect = blockRects.find((r) => r.id === block.id);
    return rect ? [{ id: block.id, top: rect.top, height: rect.height }] : [];
  });
  return { parentId, rects };
}
