import type { PageGroupListItemRecord } from '@kometio/api-contracts';

export interface SubpagesMovingUp {
  /** How many move to the top level: the API's own count, so it is right whatever the list is filtered to. */
  count: number;
  /** The ones the list happens to hold, for naming — all of them, or fewer. */
  named: PageGroupListItemRecord[];
}

/**
 * The pages under the ones being deleted that are NOT being deleted with
 * them: the API moves those to the top level first, so the question says so
 * in words. Children that are ticked too do not count: they are deleted
 * first, deepest first, and by the time their parent's turn comes there is
 * nothing under it.
 *
 * The number is each page's `childCount`, which the API answers whatever the
 * list is filtered to or paged at; the names can only be those of subpages the
 * list holds, so they are offered only when they are all there.
 */
export function subpagesMovingUp(
  selected: readonly PageGroupListItemRecord[],
  all: readonly PageGroupListItemRecord[],
): SubpagesMovingUp {
  const selectedIds = new Set(selected.map((group) => group.id));
  const named = all.filter(
    (candidate) =>
      candidate.parentId !== null &&
      selectedIds.has(candidate.parentId) &&
      !selectedIds.has(candidate.id),
  );
  const goingToo = selected.filter(
    (group) => group.parentId !== null && selectedIds.has(group.parentId),
  ).length;
  const total = selected.reduce((sum, group) => sum + group.childCount, 0);
  return { count: Math.max(total - goingToo, named.length), named };
}

/** The pages to delete, the deepest first, so what is ticked under a page is gone before the page's turn. */
export function deletionOrder(
  selected: readonly PageGroupListItemRecord[],
  all: readonly PageGroupListItemRecord[],
): PageGroupListItemRecord[] {
  const byId = new Map(all.map((group) => [group.id, group]));
  const depth = (group: PageGroupListItemRecord): number => {
    let level = 0;
    let parent = group.parentId ? byId.get(group.parentId) : undefined;
    while (parent) {
      level += 1;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return level;
  };
  return [...selected].sort((a, b) => depth(b) - depth(a));
}
