import { describe, expect, it } from 'vitest';
import type { Block, BlockRect } from '@kometio/shared-types';
import { computeContainerDrop } from './compute-container-drop';

/*
 * A page with a Columns holding two Columns, one of which has a Text, and
 * a Hero at the root — the smallest tree where "which container did the
 * pointer land in" has more than one answer.
 */
const tree: Block[] = [
  { id: 'hero', type: 'Hero', props: {} },
  {
    id: 'cols',
    type: 'Columns',
    props: {},
    children: [
      {
        id: 'col-a',
        type: 'Column',
        props: {},
        children: [{ id: 'text', type: 'Text', props: {} }],
      },
      { id: 'col-b', type: 'Column', props: {}, children: [] },
    ],
  },
];

const rects: BlockRect[] = [
  { id: 'hero', top: 0, left: 0, width: 800, height: 100 },
  { id: 'cols', top: 100, left: 0, width: 800, height: 200 },
  { id: 'col-a', top: 100, left: 0, width: 400, height: 200 },
  { id: 'text', top: 110, left: 10, width: 380, height: 40 },
  { id: 'col-b', top: 100, left: 400, width: 400, height: 200 },
];

const options = {
  isContainerType: (type: string) => type === 'Columns' || type === 'Column',
  canContain: (parentType: string, childType: string) =>
    !(parentType === 'Column' && childType === 'Column'),
};

describe('computeContainerDrop', () => {
  it('drops into the innermost container under the pointer', () => {
    expect(
      computeContainerDrop(tree, rects, 'hero', { x: 500, y: 150 }, options),
    ).toMatchObject({ parentId: 'col-b', index: 0 });
  });

  it('places the block among the children it was dropped between', () => {
    // Above the Text's midpoint (110 + 20): before it.
    expect(
      computeContainerDrop(tree, rects, 'hero', { x: 100, y: 115 }, options),
    ).toMatchObject({ parentId: 'col-a', index: 0 });
    // Below it: after it.
    expect(
      computeContainerDrop(tree, rects, 'hero', { x: 100, y: 145 }, options),
    ).toMatchObject({ parentId: 'col-a', index: 1 });
  });

  it('draws the indicator across the container, not the page', () => {
    const target = computeContainerDrop(
      tree,
      rects,
      'hero',
      { x: 500, y: 150 },
      options,
    );
    expect(target?.indicatorLeft).toBe(400);
    expect(target?.indicatorWidth).toBe(400);
    // An empty container has no child to aim between: its own top edge.
    expect(target?.indicatorTop).toBe(100);
  });

  it('refuses a container that does not accept the type', () => {
    expect(
      computeContainerDrop(tree, rects, 'col-a', { x: 500, y: 150 }, options),
    ).toBeNull();
  });

  /*
   * Dropping a container inside itself would take the whole branch out of
   * the tree with it.
   */
  it('refuses a drop into its own subtree', () => {
    expect(
      computeContainerDrop(tree, rects, 'cols', { x: 100, y: 150 }, options),
    ).toBeNull();
  });

  it('leaves a drop among its current siblings to the reorder computation', () => {
    expect(
      computeContainerDrop(tree, rects, 'text', { x: 100, y: 150 }, options),
    ).toBeNull();
  });

  it('is nothing at all when the pointer is over no container', () => {
    expect(
      computeContainerDrop(tree, rects, 'text', { x: 100, y: 50 }, options),
    ).toBeNull();
  });
});
