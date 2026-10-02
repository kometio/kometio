import { describe, expect, it } from 'vitest';
import { buildPageGroupListItemRecord } from '@kometio/testing/records';
import { deletionOrder, subpagesMovingUp } from './page-deletion';

const parent = buildPageGroupListItemRecord({ id: 'parent', parentId: null });
const childA = buildPageGroupListItemRecord({ id: 'a', parentId: 'parent' });
const childB = buildPageGroupListItemRecord({ id: 'b', parentId: 'parent' });
const grandchild = buildPageGroupListItemRecord({ id: 'g', parentId: 'a' });
const other = buildPageGroupListItemRecord({ id: 'other', parentId: null });
const all = [parent, childA, childB, grandchild, other];

describe('subpagesMovingUp', () => {
  // The API counts what hangs under each page, whatever the list holds.
  const parentWithCount = { ...parent, childCount: 2 };
  const childAWithCount = { ...childA, childCount: 1 };
  const withCounts = [
    parentWithCount,
    childAWithCount,
    childB,
    grandchild,
    other,
  ];

  it('counts the subpages that stay and move to the top level, and names them when the list holds them all', () => {
    const up = subpagesMovingUp([parentWithCount], withCounts);

    expect(up.count).toBe(2);
    expect(up.named.map((group) => group.id)).toEqual(['a', 'b']);
  });

  it('does not count a subpage that is going too', () => {
    // a and b go with the parent; a's own child is not going, and moves up.
    const up = subpagesMovingUp(
      [parentWithCount, childAWithCount, childB],
      withCounts,
    );

    expect(up.count).toBe(1);
    expect(up.named.map((group) => group.id)).toEqual(['g']);
  });

  it('knows the number when the list does not hold the subpages — a filter, another page of results', () => {
    const filtered = [{ ...parent, childCount: 5 }];

    const up = subpagesMovingUp(filtered, filtered);

    expect(up.count).toBe(5);
    expect(up.named).toEqual([]);
  });

  it('has nothing to say about pages with no subpages', () => {
    expect(subpagesMovingUp([other, grandchild], all).count).toBe(0);
  });
});

describe('deletionOrder', () => {
  it('puts the deepest first, so a parent goes after what is under it', () => {
    const order = deletionOrder([parent, grandchild, childA], all);

    expect(order.map((group) => group.id)).toEqual(['g', 'a', 'parent']);
  });

  it('keeps pages at the same depth in the order they were given', () => {
    expect(
      deletionOrder([childB, childA], all).map((group) => group.id),
    ).toEqual(['b', 'a']);
  });
});
