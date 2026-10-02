import { describe, expect, it } from 'vitest';
import type { Block } from '@kometio/shared-types';
import {
  computeDropTarget,
  findContainerAtPoint,
  siblingDropRects,
} from './compute-drop-target';

const rects = [
  { id: 'a', top: 0, height: 100 },
  { id: 'b', top: 100, height: 100 },
  { id: 'c', top: 200, height: 100 },
];

describe('computeDropTarget', () => {
  it('drops before the first block when the pointer is above its midpoint', () => {
    expect(computeDropTarget(rects, 'c', 10)).toEqual({
      index: 0,
      indicatorTop: 0,
    });
  });

  it('drops between two blocks when the pointer is past the first midpoint but before the second', () => {
    expect(computeDropTarget(rects, 'c', 120)).toEqual({
      index: 1,
      indicatorTop: 100,
    });
  });

  it('drops at the end when the pointer is past the last midpoint', () => {
    expect(computeDropTarget(rects, 'a', 260)).toEqual({
      index: 2,
      indicatorTop: 300,
    });
  });

  it('excludes the dragged block itself from the candidate list and index math', () => {
    // Dragging "b" past the midpoint of "a" (the only other one above it) —
    // the resulting index is relative to the list WITHOUT "b", ready for
    // moveBlock, which removes it before reinserting it.
    expect(computeDropTarget(rects, 'b', 60)).toEqual({
      index: 1,
      indicatorTop: 200,
    });
  });

  it('returns null when the dragged block is the only one present', () => {
    expect(
      computeDropTarget([{ id: 'a', top: 0, height: 100 }], 'a', 50),
    ).toBeNull();
  });
});

describe('findContainerAtPoint', () => {
  it('returns the container whose rect contains the point', () => {
    const rects = [
      { id: 'column-1', top: 0, left: 0, width: 400, height: 200 },
    ];
    expect(findContainerAtPoint(rects, 50, 50)).toBe('column-1');
  });

  it('returns null when the point is outside every rect', () => {
    const rects = [
      { id: 'column-1', top: 0, left: 0, width: 400, height: 200 },
    ];
    expect(findContainerAtPoint(rects, 500, 500)).toBeNull();
  });

  it('picks the smallest (deepest) rect when containers are nested', () => {
    const rects = [
      { id: 'columns', top: 0, left: 0, width: 800, height: 200 },
      { id: 'column-1', top: 0, left: 0, width: 400, height: 200 },
    ];
    expect(findContainerAtPoint(rects, 50, 50)).toBe('column-1');
  });

  it('ignores a sibling container the point does not fall inside', () => {
    const rects = [
      { id: 'column-1', top: 0, left: 0, width: 400, height: 200 },
      { id: 'column-2', top: 0, left: 400, width: 400, height: 200 },
    ];
    expect(findContainerAtPoint(rects, 450, 50)).toBe('column-2');
  });

  it('drops exactly at a midpoint by treating it as already past (pointerY > midpoint is strict)', () => {
    // "a"'s midpoint is 50 — exactly equal does not cross the threshold.
    expect(computeDropTarget(rects, 'c', 50)).toEqual({
      index: 0,
      indicatorTop: 0,
    });
  });
});

describe('siblingDropRects', () => {
  const tree: Block[] = [
    { id: 'hero', type: 'Hero', props: {} },
    {
      id: 'columns',
      type: 'Columns',
      props: {},
      children: [
        { id: 'col-1', type: 'Column', props: {} },
        { id: 'col-2', type: 'Column', props: {} },
      ],
    },
  ];
  // In document order, which interleaves every depth — exactly what the
  // function must not hand back as-is.
  const blockRects = [
    { id: 'hero', top: 0, left: 0, width: 100, height: 50 },
    { id: 'columns', top: 50, left: 0, width: 100, height: 100 },
    { id: 'col-1', top: 50, left: 0, width: 50, height: 100 },
    { id: 'col-2', top: 50, left: 50, width: 50, height: 100 },
  ];

  it('measures a nested block against its own siblings, not the root', () => {
    expect(siblingDropRects(tree, blockRects, 'col-2')).toEqual({
      parentId: 'columns',
      rects: [
        { id: 'col-1', top: 50, height: 100 },
        { id: 'col-2', top: 50, height: 100 },
      ],
    });
  });

  it('measures against the root when no block is being dragged yet', () => {
    expect(siblingDropRects(tree, blockRects, null)).toEqual({
      parentId: null,
      rects: [
        { id: 'hero', top: 0, height: 50 },
        { id: 'columns', top: 50, height: 100 },
      ],
    });
  });

  it('leaves out a sibling the canvas has not reported a rect for', () => {
    expect(siblingDropRects(tree, blockRects.slice(0, 1), null).rects).toEqual([
      { id: 'hero', top: 0, height: 50 },
    ]);
  });
});
