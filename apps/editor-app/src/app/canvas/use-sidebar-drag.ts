import { useState } from 'react';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  computeDropTarget,
  findContainerAtPoint,
  type DropCandidateRect,
} from './compute-drop-target';
import type { IframeGeometry } from './overlay-layer';
import {
  canPlace,
  locateBlock,
  nearestTargetThatHolds,
  siblingsAt,
  type BlockTreeTarget,
} from './use-block-tree';
import { findBlockById } from '@kometio/shared-types';

/** A measured block in the canvas, in the iframe's own coordinates. */
interface BlockHitRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SidebarDragState {
  descriptor: BlockDescriptor;
  pointerX: number;
  pointerY: number;
}

export interface UseSidebarDragParams {
  localBlocks: Block[];
  registry: BlockDescriptor[];
  iframeGeometry: IframeGeometry;
  /** The rects of top-level blocks, the same array the caller already computed for native canvas reordering — this avoids recomputing it a second time here. */
  rootRects: DropCandidateRect[];
  blockRects: BlockHitRect[];
  /** From use-block-tree-mutations.ts — the same mechanism as every other insert, with a target computed here rather than from a selected position. */
  insertNewBlockAt: (
    descriptor: BlockDescriptor,
    target: BlockTreeTarget,
  ) => void;
  /** Told when the dragged block has nowhere it may sit — see useBlockTreeMutations. */
  onPlacementRefused?: (blockTypes: string[]) => void;
}

export interface UseSidebarDragResult {
  sidebarDrag: SidebarDragState | null;
  handleSidebarDragStart: (descriptor: BlockDescriptor) => void;
  handleSidebarDragMove: (pageX: number, pageY: number) => void;
  handleSidebarDragEnd: (
    descriptor: BlockDescriptor,
    pageX: number,
    pageY: number,
  ) => void;
}

/**
 * Dragging a NEW block from the sidebar (BlockPicker) onto the canvas —
 * unlike `bridge.activeDrag` (reordering a block that already exists,
 * tracked by the iframe), this drag originates in the parent itself, so its
 * state lives here rather than in the bridge. `pointer` is page-relative
 * (the pointer's native coordinates in the parent's document) and has to be
 * converted to iframe-relative coordinates before reusing
 * compute-drop-target.ts (which expects the same unit as
 * bridge.blockRects).
 */
export function useSidebarDrag({
  localBlocks,
  registry,
  iframeGeometry,
  rootRects,
  blockRects,
  insertNewBlockAt,
  onPlacementRefused,
}: UseSidebarDragParams): UseSidebarDragResult {
  const [sidebarDrag, setSidebarDrag] = useState<SidebarDragState | null>(null);

  function handleSidebarDragStart(descriptor: BlockDescriptor): void {
    setSidebarDrag({ descriptor, pointerX: 0, pointerY: 0 });
  }

  function handleSidebarDragMove(pageX: number, pageY: number): void {
    setSidebarDrag((prev) =>
      prev ? { ...prev, pointerX: pageX, pointerY: pageY } : prev,
    );
  }

  /**
   * Unlike click-to-insert (resolveInsertTarget, based on the SELECTED
   * block), a drag has a real release point — using it to decide the
   * container instead of the selection is what fixed the bug reported from
   * live use: dragging a block onto a container other than the one still
   * selected previously nested it in the latter anyway, not in the one
   * visually under the pointer, producing a layout that looked broken
   * (content and toolbar positioned somewhere other than the real drop).
   * `blockRects` already includes every nested block, not only top-level
   * ones (unlike `rootRects`, which is scoped to sibling reordering) — here
   * it is narrowed to the blocks the registry marks as containers, and the
   * smallest rect (the deepest container) containing the point wins.
   *
   * That container is where the person let go, whether or not it may hold
   * what they dragged. When it may, the block goes in at its end. When it
   * may not — a Heading over a list of testimonials — the block goes BESIDE
   * it, on the side the pointer was on: taking the innermost container that
   * accepts instead used to put the block at the bottom of whatever held
   * the list, which could be a screen away from the drop.
   */
  function handleSidebarDragEnd(
    descriptor: BlockDescriptor,
    pageX: number,
    pageY: number,
  ): void {
    setSidebarDrag(null);
    const isOverCanvas =
      pageX >= iframeGeometry.left &&
      pageX <= iframeGeometry.left + iframeGeometry.width &&
      pageY >= iframeGeometry.top;
    if (!isOverCanvas) {
      return;
    }
    const iframeX = pageX - iframeGeometry.left;
    const iframeY = pageY - iframeGeometry.top;
    const descriptorOf = (blockId: string) => {
      const block = findBlockById(localBlocks, blockId);
      return block ? registry.find((d) => d.type === block.type) : undefined;
    };
    const containerRects = blockRects.filter(
      (rect) => descriptorOf(rect.id)?.isContainer,
    );
    const hitContainerId = findContainerAtPoint(
      containerRects,
      iframeX,
      iframeY,
    );
    const hitContainer = hitContainerId
      ? findBlockById(localBlocks, hitContainerId)
      : null;
    const target = nearestTargetThatHolds(
      localBlocks,
      registry,
      dropTargetAt(hitContainer, descriptor.type, iframeX, iframeY),
      [descriptor.type],
    );
    if (!target) {
      onPlacementRefused?.([descriptor.type]);
      return;
    }
    insertNewBlockAt(descriptor, target);
  }

  /** Where a drop lands before asking whether its parent may hold it — see handleSidebarDragEnd. */
  function dropTargetAt(
    hitContainer: Block | null,
    draggedType: string,
    iframeX: number,
    iframeY: number,
  ): BlockTreeTarget {
    if (!hitContainer?.id) {
      return {
        parentId: null,
        index:
          computeDropTarget(rootRects, '', iframeY)?.index ??
          localBlocks.length,
      };
    }
    if (canPlace(registry, hitContainer.type, draggedType)) {
      return {
        parentId: hitContainer.id,
        index: hitContainer.children?.length ?? 0,
      };
    }
    // Beside the container itself, by its own box: which half of IT the
    // pointer is in. Measuring against every sibling's midpoint put a drop
    // at the far end of a row when the siblings sit side by side.
    const location = locateBlock(localBlocks, hitContainer.id);
    const rect = blockRects.find((r) => r.id === hitContainer.id);
    if (!location || !rect) {
      return { parentId: null, index: localBlocks.length };
    }
    const siblingRects = siblingsAt(localBlocks, location.parentId).flatMap(
      (sibling) => {
        const found =
          sibling.id && sibling.id !== hitContainer.id
            ? blockRects.find((r) => r.id === sibling.id)
            : undefined;
        return found ? [found] : [];
      },
    );
    return {
      parentId: location.parentId,
      index:
        location.index +
        (dropsAfter(rect, siblingRects, iframeX, iframeY) ? 1 : 0),
    };
  }

  /**
   * Which side of a block the pointer was let go on — along the axis its
   * siblings are laid out on.
   *
   * Vertically for a stack, which is what a page usually is. In a ROW the
   * vertical midpoint says nothing: every block in it starts at the same
   * height, so a drop on the right-hand block's upper half would read as
   * "before it" and land the new block at the start of the row. A sibling
   * sharing this block's vertical band while sitting beside it is what
   * makes it a row.
   */
  function dropsAfter(
    rect: BlockHitRect,
    siblingRects: BlockHitRect[],
    iframeX: number,
    iframeY: number,
  ): boolean {
    const inARow = siblingRects.some(
      (sibling) =>
        sibling.top < rect.top + rect.height &&
        sibling.top + sibling.height > rect.top &&
        (sibling.left >= rect.left + rect.width ||
          sibling.left + sibling.width <= rect.left),
    );
    return inARow
      ? iframeX > rect.left + rect.width / 2
      : iframeY > rect.top + rect.height / 2;
  }

  return {
    sidebarDrag,
    handleSidebarDragStart,
    handleSidebarDragMove,
    handleSidebarDragEnd,
  };
}
