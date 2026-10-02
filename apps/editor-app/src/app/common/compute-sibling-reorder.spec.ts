import { describe, expect, it } from 'vitest';
import type { HierarchyItem } from './page-hierarchy';
import { computeSiblingReorder } from './compute-sibling-reorder';

function item(overrides: Partial<HierarchyItem>): HierarchyItem {
  return { id: 'id', parentId: null, ...overrides };
}

describe('computeSiblingReorder', () => {
  it('moves the active item to the position of the over item, within the same parentId group', () => {
    const items = [
      item({ id: 'a', parentId: null }),
      item({ id: 'b', parentId: null }),
      item({ id: 'c', parentId: null }),
    ];
    expect(computeSiblingReorder(items, 'a', 'c')).toEqual({
      parentId: null,
      orderedIds: ['b', 'c', 'a'],
    });
  });

  it('returns null when dropped on itself', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    expect(computeSiblingReorder(items, 'a', 'a')).toBeNull();
  });

  it('returns null when there is no drop target', () => {
    const items = [item({ id: 'a' })];
    expect(computeSiblingReorder(items, 'a', null)).toBeNull();
  });

  it('rejects a drop across different parents (reparenting has no UI yet)', () => {
    const items = [
      item({ id: 'a', parentId: null }),
      item({ id: 'root' }),
      item({ id: 'b', parentId: 'root' }),
    ];
    expect(computeSiblingReorder(items, 'a', 'b')).toBeNull();
  });

  it('only reorders within the dragged group, ignoring items from other groups mixed into the flat list', () => {
    const items = [
      item({ id: 'root' }),
      item({ id: 'a', parentId: 'root' }),
      item({ id: 'x', parentId: null }), // unrelated sibling, different group
      item({ id: 'b', parentId: 'root' }),
    ];
    expect(computeSiblingReorder(items, 'a', 'b')).toEqual({
      parentId: 'root',
      orderedIds: ['b', 'a'],
    });
  });
});
