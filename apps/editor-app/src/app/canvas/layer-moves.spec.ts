import { describe, expect, it } from 'vitest';
import type { Block } from '@kometio/shared-types';
import { computeNestedReorder, computeReparent } from './layer-moves';

describe('computeNestedReorder', () => {
  it('moves the active block to the position of the over block, among root siblings', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'Text', props: {} },
      { id: 'b', type: 'Text', props: {} },
      { id: 'c', type: 'Text', props: {} },
    ];
    expect(computeNestedReorder(blocks, 'a', 'c')).toEqual({
      parentId: null,
      orderedIds: ['b', 'c', 'a'],
    });
  });

  it('moves the active block among its nested siblings, inside the same container', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [
          { id: 'child-a', type: 'Text', props: {} },
          { id: 'child-b', type: 'Text', props: {} },
          { id: 'child-c', type: 'Text', props: {} },
        ],
      },
    ];
    expect(computeNestedReorder(blocks, 'child-a', 'child-c')).toEqual({
      parentId: 'container-1',
      orderedIds: ['child-b', 'child-c', 'child-a'],
    });
  });

  it('returns null when dropped on itself', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'Text', props: {} },
      { id: 'b', type: 'Text', props: {} },
    ];
    expect(computeNestedReorder(blocks, 'a', 'a')).toBeNull();
  });

  it('returns null when there is no drop target', () => {
    const blocks: Block[] = [{ id: 'a', type: 'Text', props: {} }];
    expect(computeNestedReorder(blocks, 'a', null)).toBeNull();
  });

  it('returns null for a block id not present in the tree', () => {
    const blocks: Block[] = [{ id: 'a', type: 'Text', props: {} }];
    expect(computeNestedReorder(blocks, 'a', 'ghost')).toBeNull();
  });

  it("rejects a drop across different parents (reparenting via drag isn't supported)", () => {
    const blocks: Block[] = [
      { id: 'root-a', type: 'Text', props: {} },
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'child-a', type: 'Text', props: {} }],
      },
    ];
    expect(computeNestedReorder(blocks, 'root-a', 'child-a')).toBeNull();
  });

  it('rejects a drop between children of two different containers, even at the same depth', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'child-a', type: 'Text', props: {} }],
      },
      {
        id: 'container-2',
        type: 'Container',
        props: {},
        children: [{ id: 'child-b', type: 'Text', props: {} }],
      },
    ];
    expect(computeNestedReorder(blocks, 'child-a', 'child-b')).toBeNull();
  });
});

describe('computeReparent', () => {
  const tree: Block[] = [
    { id: 'hero', type: 'Hero', props: {} },
    { id: 'sibling', type: 'Text', props: {} },
    {
      id: 'cols',
      type: 'Columns',
      props: {},
      children: [
        { id: 'col-a', type: 'Column', props: {}, children: [] },
        {
          id: 'col-b',
          type: 'Column',
          props: {},
          children: [{ id: 'text', type: 'Text', props: {} }],
        },
      ],
    },
    { id: 'quotes', type: 'Testimonials', props: {}, children: [] },
  ];

  const CONTAINERS = new Set(['Columns', 'Column', 'Testimonials']);
  const options = {
    isContainerType: (type: string) => CONTAINERS.has(type),
    canContain: (parentType: string, childType: string) =>
      parentType === 'Testimonials' ? childType === 'Testimonial' : true,
  };

  /* An empty container has no child row to aim between — its own row is the only target. */
  it('drops a block inside an empty container, at the end', () => {
    expect(computeReparent(tree, 'hero', 'col-a', options)).toEqual({
      blockId: 'hero',
      parentId: 'col-a',
      index: 0,
    });
  });

  it('drops a block beside an ordinary row, becoming its sibling', () => {
    expect(computeReparent(tree, 'hero', 'text', options)).toEqual({
      blockId: 'hero',
      parentId: 'col-b',
      index: 0,
    });
  });

  /*
   * The one that would break a page rather than look wrong: a container
   * dropped inside itself detaches the whole subtree from the tree.
   */
  it('refuses a drop into its own subtree', () => {
    expect(computeReparent(tree, 'cols', 'col-a', options)).toBeNull();
    expect(computeReparent(tree, 'col-b', 'text', options)).toBeNull();
  });

  /* The same rule the drag-from-sidebar path already honours. */
  it('refuses a container that does not accept that type', () => {
    expect(computeReparent(tree, 'hero', 'quotes', options)).toBeNull();
  });

  /*
   * A same-parent drop between ordinary rows is a REORDER and belongs to
   * computeNestedReorder — answering it here too would give one gesture
   * two implementations.
   */
  it('refuses a same-parent drop between ordinary rows', () => {
    expect(computeReparent(tree, 'hero', 'sibling', options)).toBeNull();
  });

  /*
   * Dropping onto a CONTAINER's row always means "inside it", even when
   * the two are siblings — that is how a root block gets into a Columns,
   * and there is no other gesture for it.
   */
  it('puts a block inside a sibling container', () => {
    expect(computeReparent(tree, 'hero', 'cols', options)).toEqual({
      blockId: 'hero',
      parentId: 'cols',
      index: 2,
    });
  });

  it('refuses a drop on nothing, or on itself', () => {
    expect(computeReparent(tree, 'hero', null, options)).toBeNull();
    expect(computeReparent(tree, 'hero', 'hero', options)).toBeNull();
  });
});
