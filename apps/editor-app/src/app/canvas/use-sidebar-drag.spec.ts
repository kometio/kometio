import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { useSidebarDrag } from './use-sidebar-drag';

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: 'Titolo' },
  fields: [],
};
const containerDescriptor: BlockDescriptor = {
  type: 'Container',
  label: 'Contenitore',
  category: 'layout',
  defaultProps: {},
  fields: [],
  isContainer: true,
};

const testimonialsDescriptor: BlockDescriptor = {
  type: 'Testimonials',
  label: 'Testimonials',
  category: 'socialProof',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Testimonial'],
};

const testimonialDescriptor: BlockDescriptor = {
  type: 'Testimonial',
  label: 'Testimonial',
  category: 'socialProof',
  defaultProps: {},
  fields: [],
};

/** A container that takes only Testimonials — so a Hero refused by the list inside it is refused here too. */
const testimonialsWallDescriptor: BlockDescriptor = {
  type: 'TestimonialsWall',
  label: 'Testimonials wall',
  category: 'socialProof',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Testimonials'],
};

const columnsDescriptor: BlockDescriptor = {
  type: 'Columns',
  label: 'Colonne',
  category: 'layout',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Column'],
};

const columnDescriptor: BlockDescriptor = {
  type: 'Column',
  label: 'Colonna',
  category: 'layout',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedParentTypes: ['Columns'],
};

const registry = [
  columnsDescriptor,
  columnDescriptor,
  heroDescriptor,
  containerDescriptor,
  testimonialsDescriptor,
  testimonialDescriptor,
  testimonialsWallDescriptor,
];
const iframeGeometry = { top: 100, left: 50, width: 800, height: 600 };

function setup(
  overrides: {
    localBlocks?: Block[];
    rootRects?: { id: string; top: number; height: number }[];
    blockRects?: {
      id: string;
      top: number;
      left: number;
      width: number;
      height: number;
    }[];
  } = {},
) {
  const insertNewBlockAt = vi.fn();
  const onPlacementRefused = vi.fn<(types: string[]) => void>();
  const { result } = renderHook(() =>
    useSidebarDrag({
      localBlocks: overrides.localBlocks ?? [],
      registry,
      iframeGeometry,
      rootRects: overrides.rootRects ?? [],
      blockRects: overrides.blockRects ?? [],
      insertNewBlockAt,
      onPlacementRefused,
    }),
  );
  return { result, insertNewBlockAt, onPlacementRefused };
}

describe('useSidebarDrag', () => {
  it('starts with no drag in progress', () => {
    const { result } = setup();

    expect(result.current.sidebarDrag).toBeNull();
  });

  it('handleSidebarDragStart begins tracking the descriptor at the origin', () => {
    const { result } = setup();

    act(() => {
      result.current.handleSidebarDragStart(heroDescriptor);
    });

    expect(result.current.sidebarDrag).toEqual({
      descriptor: heroDescriptor,
      pointerX: 0,
      pointerY: 0,
    });
  });

  it('handleSidebarDragMove updates the tracked pointer position', () => {
    const { result } = setup();
    act(() => {
      result.current.handleSidebarDragStart(heroDescriptor);
    });

    act(() => {
      result.current.handleSidebarDragMove(120, 340);
    });

    expect(result.current.sidebarDrag).toEqual({
      descriptor: heroDescriptor,
      pointerX: 120,
      pointerY: 340,
    });
  });

  it('handleSidebarDragMove does nothing when no drag is in progress', () => {
    const { result } = setup();

    act(() => {
      result.current.handleSidebarDragMove(120, 340);
    });

    expect(result.current.sidebarDrag).toBeNull();
  });

  it('handleSidebarDragEnd clears the drag state even when the drop misses the canvas', () => {
    const { result, insertNewBlockAt } = setup();
    act(() => {
      result.current.handleSidebarDragStart(heroDescriptor);
    });

    act(() => {
      // pageY below iframeGeometry.top — outside the canvas.
      result.current.handleSidebarDragEnd(heroDescriptor, 100, 10);
    });

    expect(result.current.sidebarDrag).toBeNull();
    expect(insertNewBlockAt).not.toHaveBeenCalled();
  });

  it('inserts at the root when dropped over the canvas but not over any container', () => {
    const { result, insertNewBlockAt } = setup({
      localBlocks: [{ id: 'text-1', type: 'Text', props: {} }],
      rootRects: [{ id: 'text-1', top: 0, height: 40 }],
    });

    act(() => {
      // pageX/pageY inside iframeGeometry bounds (left 50..850, top 100+).
      result.current.handleSidebarDragEnd(heroDescriptor, 400, 150);
    });

    expect(insertNewBlockAt).toHaveBeenCalledWith(
      heroDescriptor,
      expect.objectContaining({ parentId: null }),
    );
  });

  /*
   * A container that refuses the dragged type is not a place to drop INTO,
   * but it is still where the person let go: the block lands beside it, on
   * the side of it the pointer was on — not at the bottom of whatever holds
   * it, which could be a screen away.
   */
  describe('over a container that may not hold the dragged type', () => {
    const tree: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [
          { id: 'h-top', type: 'Hero', props: {} },
          { id: 'testi-1', type: 'Testimonials', props: {}, children: [] },
          { id: 'h-bottom', type: 'Hero', props: {} },
        ],
      },
    ];
    const blockRects = [
      { id: 'container-1', top: 0, left: 0, width: 700, height: 600 },
      { id: 'h-top', top: 0, left: 0, width: 700, height: 100 },
      { id: 'testi-1', top: 100, left: 0, width: 700, height: 200 },
      { id: 'h-bottom', top: 300, left: 0, width: 700, height: 100 },
    ];

    it('drops just after it when the pointer is on its lower half', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      // iframe y = 350 - 100 = 250: inside Testimonials, below its middle.
      act(() => {
        result.current.handleSidebarDragEnd(heroDescriptor, 400, 350);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
        parentId: 'container-1',
        index: 2,
      });
    });

    it('drops just before it when the pointer is on its upper half', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      // iframe y = 250 - 100 = 150: inside Testimonials, above its middle.
      act(() => {
        result.current.handleSidebarDragEnd(heroDescriptor, 400, 250);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
        parentId: 'container-1',
        index: 1,
      });
    });

    it('still drops a type it DOES accept inside it', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      act(() => {
        result.current.handleSidebarDragEnd(testimonialDescriptor, 400, 350);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(testimonialDescriptor, {
        parentId: 'testi-1',
        index: 0,
      });
    });
  });

  /*
   * Side by side, the siblings' midpoints say nothing about which side of
   * the container the pointer was on: every one of them has the same top.
   */
  /*
   * Side by side, every block starts at the same height: which half of the
   * block the pointer is in can only be read across, not down.
   */
  describe('over a refusing container in a row of blocks', () => {
    const tree: Block[] = [
      {
        id: 'row',
        type: 'Container',
        props: {},
        children: [
          { id: 'left', type: 'Testimonials', props: {}, children: [] },
          { id: 'middle', type: 'Hero', props: {} },
          { id: 'right', type: 'Testimonials', props: {}, children: [] },
        ],
      },
    ];
    const blockRects = [
      { id: 'row', top: 0, left: 0, width: 900, height: 300 },
      { id: 'left', top: 0, left: 0, width: 300, height: 300 },
      { id: 'middle', top: 0, left: 300, width: 300, height: 300 },
      { id: 'right', top: 0, left: 600, width: 300, height: 300 },
    ];

    it('drops right after the left one from its right half', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      // iframe (250, 250): inside `left` (0..300), right of its middle.
      act(() => {
        result.current.handleSidebarDragEnd(heroDescriptor, 300, 350);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
        parentId: 'row',
        index: 1,
      });
    });

    it('drops before the left one from its left half, whatever the height', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      // iframe (100, 250): inside `left`, left of its middle and low down —
      // the height is what the vertical rule would have read.
      act(() => {
        result.current.handleSidebarDragEnd(heroDescriptor, 150, 350);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
        parentId: 'row',
        index: 0,
      });
    });

    it('drops right before the right one from its left half', () => {
      const { result, insertNewBlockAt } = setup({
        localBlocks: tree,
        blockRects,
      });

      // iframe (700, 50): inside `right` (600..900), left of its middle.
      act(() => {
        result.current.handleSidebarDragEnd(heroDescriptor, 750, 150);
      });

      expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
        parentId: 'row',
        index: 2,
      });
    });
  });

  it('steps out of every container that refuses the dragged type, not only the one under the pointer', () => {
    const tree: Block[] = [
      { id: 'top', type: 'Hero', props: {} },
      {
        id: 'wall',
        type: 'TestimonialsWall',
        props: {},
        children: [
          { id: 'list', type: 'Testimonials', props: {}, children: [] },
        ],
      },
    ];
    const { result, insertNewBlockAt } = setup({
      localBlocks: tree,
      blockRects: [
        { id: 'top', top: 0, left: 0, width: 700, height: 100 },
        { id: 'wall', top: 100, left: 0, width: 700, height: 300 },
        { id: 'list', top: 150, left: 50, width: 600, height: 200 },
      ],
    });

    act(() => {
      result.current.handleSidebarDragEnd(heroDescriptor, 400, 450);
    });

    expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
      parentId: null,
      index: 2,
    });
  });

  it('inserts as a child of the container under the drop point', () => {
    const containerBlock: Block = {
      id: 'container-1',
      type: 'Container',
      props: {},
      children: [],
    };
    const { result, insertNewBlockAt } = setup({
      localBlocks: [containerBlock],
      blockRects: [
        { id: 'container-1', top: 0, left: 0, width: 700, height: 500 },
      ],
    });

    // iframeX/Y = (pageX - left, pageY - top) = (350, 200), inside the
    // container rect above.
    act(() => {
      result.current.handleSidebarDragEnd(heroDescriptor, 400, 300);
    });

    expect(insertNewBlockAt).toHaveBeenCalledWith(heroDescriptor, {
      parentId: 'container-1',
      index: 0,
    });
  });
});

/*
 * A block that belongs inside one kind of container can be dropped anywhere
 * on the canvas. Dropping it outside used to put it wherever the pointer
 * happened to be.
 */
describe('useSidebarDrag with a block that names its container', () => {
  const tree: Block[] = [
    { id: 'top', type: 'Hero', props: {} },
    { id: 'grid', type: 'Columns', props: {}, children: [] },
  ];
  const blockRects = [
    { id: 'top', top: 0, left: 0, width: 700, height: 200 },
    { id: 'grid', top: 200, left: 0, width: 700, height: 200 },
  ];

  it('refuses a drop that lands nowhere it may sit, and says so', () => {
    const { result, insertNewBlockAt, onPlacementRefused } = setup({
      localBlocks: tree,
      blockRects,
    });

    // iframe (350, 100): over the Hero, so the page root is the only
    // candidate — and a Column does not belong there.
    act(() => {
      result.current.handleSidebarDragEnd(columnDescriptor, 400, 200);
    });

    expect(insertNewBlockAt).not.toHaveBeenCalled();
    expect(onPlacementRefused).toHaveBeenCalledWith(['Column']);
  });

  it('drops it into the grid it belongs in', () => {
    const { result, insertNewBlockAt, onPlacementRefused } = setup({
      localBlocks: tree,
      blockRects,
    });

    // iframe (350, 300): inside the Columns block.
    act(() => {
      result.current.handleSidebarDragEnd(columnDescriptor, 400, 400);
    });

    expect(onPlacementRefused).not.toHaveBeenCalled();
    expect(insertNewBlockAt).toHaveBeenCalledWith(columnDescriptor, {
      parentId: 'grid',
      index: 0,
    });
  });
});
