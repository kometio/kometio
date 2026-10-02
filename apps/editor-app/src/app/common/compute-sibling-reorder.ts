import { arrayMove } from '@dnd-kit/sortable';
import type { HierarchyItem } from './page-hierarchy';

export interface SiblingReorderResult {
  parentId: string | null;
  orderedIds: string[];
}

/**
 * Isolated for testing without simulating a real dnd-kit drag (pointer
 * events + DOM measurement) in jsdom — same reasoning as
 * canvas/layers-panel.tsx's own computeNestedReorder. Generic over
 * `HierarchyItem` (page-hierarchy.ts) — the old per-locale
 * `compute-sibling-reorder.ts` this replaces also scoped by `locale`,
 * which no longer exists on the shared PageGroup hierarchy: two items
 * are siblings here purely by `parentId`.
 *
 * A drop is only meaningful within the SAME `parentId` sibling group the
 * backend actually orders (see reorderSiblingPageGroups) — a drop across
 * groups is rejected (`null`) rather than reparenting: moving a page to
 * another parent changes its address, and happens through "Move in the
 * tree" (docs/adr/0074), where the person sees that before choosing.
 */
export function computeSiblingReorder<T extends HierarchyItem>(
  items: T[],
  activeId: string,
  overId: string | null,
): SiblingReorderResult | null {
  if (!overId || activeId === overId) {
    return null;
  }
  const active = items.find((item) => item.id === activeId);
  const over = items.find((item) => item.id === overId);
  if (!active || !over) {
    return null;
  }
  if (active.parentId !== over.parentId) {
    return null;
  }

  const siblingIds = items
    .filter((item) => item.parentId === active.parentId)
    .map((item) => item.id);
  const oldIndex = siblingIds.indexOf(activeId);
  const newIndex = siblingIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) {
    return null;
  }

  return {
    parentId: active.parentId,
    orderedIds: arrayMove(siblingIds, oldIndex, newIndex),
  };
}
