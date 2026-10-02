export interface HierarchyItem {
  id: string;
  parentId: string | null;
}

function groupByParent<T extends HierarchyItem>(items: T[]): Map<string, T[]> {
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = childrenByParent.get(item.parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentId, siblings);
  }
  return childrenByParent;
}

/**
 * Every descendant of `rootId` within `items` (not including `rootId`
 * itself) — what a parent picker leaves out, since nothing can move under
 * itself. The API remains the real authority. Generic over `{id,
 * parentId}`: the term tree uses it, and any other one-parent tree can.
 */
export function collectDescendantIds<T extends HierarchyItem>(
  items: T[],
  rootId: string,
): Set<string> {
  const childrenByParent = groupByParent(items);
  const descendants = new Set<string>();
  const stack = [rootId];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const child of childrenByParent.get(id) ?? []) {
      if (!descendants.has(child.id)) {
        descendants.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return descendants;
}

export interface HierarchyNode<T> {
  item: T;
  depth: number;
  /**
   * Whether this item is the last of its siblings, and the same answer
   * for each of its ancestors.
   *
   * Carried on the flattened node because only the walk knows it: the
   * list that renders these rows has lost the parent/child structure by
   * then, and a tree guide cannot be drawn without knowing where each
   * branch ends (see TreeGuides).
   */
  isLast: boolean;
  ancestorIsLast: boolean[];
}

/**
 * Depth-first, indented order (parent immediately followed by its
 * children) for rendering a simple nested list — no virtual root node, no
 * collapse/expand state. An item whose parentId isn't in `items` (e.g.
 * the parent sits on a different page of a paginated result set) is
 * treated as a root rather than dropped — same "5-15 pagine per sito, una
 * pagina di risultati" scale assumption already used elsewhere
 * (PagePickerDialog).
 */
export function buildHierarchyTree<T extends HierarchyItem>(
  items: T[],
): HierarchyNode<T>[] {
  const childrenByParent = groupByParent(items);
  const idsInList = new Set(items.map((item) => item.id));
  const roots = items.filter(
    (item) => !item.parentId || !idsInList.has(item.parentId),
  );

  const result: HierarchyNode<T>[] = [];
  function visit(
    item: T,
    depth: number,
    isLast: boolean,
    ancestorIsLast: boolean[],
  ) {
    result.push({ item, depth, isLast, ancestorIsLast });
    const children = childrenByParent.get(item.id) ?? [];
    children.forEach((child, index) =>
      visit(child, depth + 1, index === children.length - 1, [
        ...ancestorIsLast,
        isLast,
      ]),
    );
  }
  roots.forEach((root, index) =>
    visit(root, 0, index === roots.length - 1, []),
  );
  return result;
}
