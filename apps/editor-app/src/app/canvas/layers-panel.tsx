import { type ReactNode, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  blockName,
  LayersTreeContext,
  renderRow,
  type LayerTypeDescription,
} from './layer-row';
import { useDragAnnouncements } from '../common/use-drag-announcements';

import type { Block } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import { findBlockById } from '@kometio/shared-types';
import { computeNestedReorder, computeReparent } from './layer-moves';

/** One empty map for every panel given none, rather than a new one per render. */
const NOTHING_FOUND: ReadonlyMap<string, readonly string[]> = new Map();

/** No type described: every row shows its type name. What a caller that passes nothing gets. */
const DESCRIBE_NOTHING = (): undefined => undefined;

export interface LayersPanelProps {
  blocks: Block[];
  hoveredBlockId: string | null;
  selectedBlockId: string | null;
  /**
   * Called with `(parentId, orderedIds)` after a completed drag, at any
   * depth — `parentId: null` for top-level siblings, otherwise the id of
   * the container block whose children were reordered. Every visible row
   * (root or nested) shares the same `SortableContext`;
   * `computeNestedReorder` (layer-moves.ts) rejects a drop between siblings of
   * different parents rather than reparenting — the same principle as
   * `computeSiblingReorder` (`compute-sibling-reorder.ts`,
   * pages-list-view.tsx) for the exact same flat multi-group list problem.
   */
  onReorder?: (parentId: string | null, orderedIds: string[]) => void;
  /**
   * Called when a row is dropped onto a DIFFERENT parent — moving a block
   * into or out of a container without deleting and rebuilding it (Fase 7).
   *
   * Before this, `computeNestedReorder` refused a cross-parent drop
   * outright: reparenting was impossible by construction, and the only way
   * to move a block into a Column was to delete it and build it again in
   * place, losing its styling and its text.
   */
  onReparent?: (
    blockId: string,
    parentId: string | null,
    index: number,
  ) => void;
  /**
   * Whether `parentType` may hold `childType`, and whether a type can hold
   * anything at all — the descriptors' own rules (`isContainer` plus
   * `allowedChildTypes`), passed as predicates rather than as the registry
   * itself so this panel keeps knowing nothing about block descriptors.
   */
  canContain?: (parentType: string, childType: string) => boolean;
  isContainerType?: (type: string) => boolean;
  /**
   * Selects a block by clicking its row directly — the only reliable way to
   * select a container block when one of its children covers it entirely on
   * the canvas (a Column holding a single full-width Gallery, say: no
   * canvas pixel belongs to the Column any more, and every click there
   * would always select the Gallery). Before this prop the Layers panel
   * showed hover and selection but offered no way to ACT on a row (a bug
   * reported from live use).
   */
  onSelect: (blockId: string, additive: boolean) => void;
  /**
   * The menu a row opens on right-click (a `ContextMenuContent`). The row
   * selects its block first, so the menu acts on it.
   */
  contextMenu?: ReactNode;
  /** Every selected id (Fase 7) — `selectedBlockId` is the last of them. */
  selectedBlockIds?: string[];
  /**
   * The icons each block stores that the active theme does not have, by
   * block id (ADR-0090) — worked out by the caller, which has the
   * descriptors, so this panel keeps knowing nothing about them.
   */
  missingIcons?: ReadonlyMap<string, readonly string[]>;
  /**
   * The placeholders a generated page left to replace, by block id —
   * `findPlaceholders` from @kometio/shared-types.
   */
  placeholders?: ReadonlyMap<string, readonly string[]>;
  /**
   * What each block type is called, and its picture — the caller's
   * registry, which has the active theme's blocks as well as core's. The
   * panel used to read core's own list, so a theme's block showed its
   * type name and no picture.
   */
  describeType?: (type: string) => LayerTypeDescription | undefined;
}

/**
 * Every visible id (root and nested, root included), respecting the
 * collapsed state — a child inside a collapsed container is not rendered
 * and so must not appear in the `SortableContext`'s `items` (dnd-kit
 * expects every declared id to correspond to a genuinely mounted node). A
 * block with no id is excluded: there is nothing for `useSortable` to hook
 * onto, and its row stays visible but not draggable (see `renderRow`).
 */
function collectSortableIds(
  blocks: Block[],
  collapsedIds: ReadonlySet<string>,
): string[] {
  return blocks.flatMap((block) => {
    if (!block.id) {
      return [];
    }
    const showChildren =
      Boolean(block.children?.length) && !collapsedIds.has(block.id);
    return [
      block.id,
      ...(showChildren
        ? collectSortableIds(block.children ?? [], collapsedIds)
        : []),
    ];
  });
}

/**
 * The block tree (see the visual editor plan, Day 2/3) — it shows the hover
 * and selection arriving from the canvas through usePreviewBridge, and lets
 * blocks be reordered by drag-and-drop in the parent's document (dnd-kit),
 * at ANY depth — root and nested (inside a Container/Columns/etc.) share
 * the same mechanism, not just the root. Always reliable across browsers,
 * independently of direct dragging on the canvas (cross-iframe, with native
 * constraints that differ from browser to browser).
 */
export function LayersPanel({
  blocks,
  hoveredBlockId,
  selectedBlockId,
  onReorder,
  selectedBlockIds = [],
  onReparent,
  canContain,
  isContainerType,
  onSelect,
  contextMenu,
  missingIcons = NOTHING_FOUND,
  placeholders = NOTHING_FOUND,
  describeType = DESCRIBE_NOTHING,
}: LayersPanelProps) {
  // Expanded by default (no surprise for anyone already using the panel) —
  // a container only shows up here once the user collapses it themselves,
  // asked for from live use: with many nested blocks the list got too long
  // to scroll through to find one.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const { tLabel } = useTranslation();
  const accessibility = useDragAnnouncements((id) => {
    const block = findBlockById(blocks, String(id));
    return block ? blockName(block, describeType, tLabel) : String(id);
  });

  function toggleCollapsed(blockId: string): void {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  // Without an activation threshold, dnd-kit captures the pointer on the
  // first pointerdown on a row — EVEN a plain click, with no movement at
  // all, would be treated as a possible drag start, interfering with the row
  // button's onClick (seen live in a real browser: clicking to select
  // stopped working — a jsdom test did not catch it, because jsdom does not
  // reproduce a real browser's pointer capture). A small minimum-distance
  // threshold (the pattern dnd-kit itself recommends) tells an ordinary
  // click from a real drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space/Enter to grab the focused row, arrows to move it, Space/Enter
    // again to drop, Esc to cancel — dnd-kit's standard keyboard pattern
    // for a sortable list (closing the reported gap: before this, only a
    // mouse drag could reorder a nested block in here).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (blocks.length === 0) {
    return null;
  }

  function handleDragEnd(event: DragEndEvent): void {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    // Reorder first: a drop between siblings of the same parent is the
    // common gesture, and `computeReparent` deliberately refuses it so
    // the two never both answer the same drop.
    const reordered = onReorder
      ? computeNestedReorder(blocks, activeId, overId)
      : null;
    if (reordered) {
      onReorder?.(reordered.parentId, reordered.orderedIds);
      return;
    }
    if (!onReparent || !canContain || !isContainerType) {
      return;
    }
    const reparented = computeReparent(blocks, activeId, overId, {
      isContainerType,
      canContain,
    });
    if (reparented) {
      onReparent(reparented.blockId, reparented.parentId, reparented.index);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={accessibility}
    >
      <SortableContext
        items={collectSortableIds(blocks, collapsedIds)}
        strategy={verticalListSortingStrategy}
      >
        <LayersTreeContext.Provider
          value={{
            hoveredBlockId,
            selectedBlockId,
            selectedBlockIds,
            onSelect,
            contextMenu,
            collapsedIds,
            onToggleCollapsed: toggleCollapsed,
            missingIcons,
            placeholders,
            describeType,
          }}
        >
          <ul>
            {blocks.map((block, index) =>
              renderRow(
                { block, depth: 0, isLast: index === blocks.length - 1 },
                index,
              ),
            )}
          </ul>
        </LayersTreeContext.Provider>
      </SortableContext>
    </DndContext>
  );
}
