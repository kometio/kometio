import { describe, expect, it } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  blockAncestry,
  blockIds,
  cloneBlockWithNewIds,
  createBlockFromDescriptor,
  insertBlock,
  locateBlock,
  moveBlock,
  removeBlock,
  siblingsAt,
  updateBlockProps,
  updateBlockStyleOverride,
  canHoldChild,
  canPlace,
  nearestTargetThatHolds,
  countBlocks,
} from './use-block-tree';
import { findBlockById } from '@kometio/shared-types';

function tree(): Block[] {
  return [
    { id: 'hero-1', type: 'Hero', props: { title: 'Old' } },
    {
      id: 'container-1',
      type: 'Container',
      props: {},
      children: [{ id: 'text-1', type: 'Text', props: { body: 'nested' } }],
    },
  ];
}

describe('findBlockById', () => {
  it('finds a top-level block', () => {
    expect(findBlockById(tree(), 'hero-1')?.type).toBe('Hero');
  });

  it('finds a nested block', () => {
    expect(findBlockById(tree(), 'text-1')?.type).toBe('Text');
  });

  it('returns null for an unknown id', () => {
    expect(findBlockById(tree(), 'ghost')).toBeNull();
  });
});

describe('updateBlockProps', () => {
  it('merges new props onto the existing ones, at the top level', () => {
    const result = updateBlockProps(tree(), 'hero-1', { title: 'New' });
    expect(result[0].props).toEqual({ title: 'New' });
  });

  it('merges new props without dropping untouched fields', () => {
    const blocks: Block[] = [
      { id: 'hero-1', type: 'Hero', props: { title: 'T', subtitle: 'S' } },
    ];
    const result = updateBlockProps(blocks, 'hero-1', { title: 'New' });
    expect(result[0].props).toEqual({ title: 'New', subtitle: 'S' });
  });

  it('updates a block nested inside children', () => {
    const result = updateBlockProps(tree(), 'text-1', { body: 'changed' });
    expect(result[1].children?.[0].props).toEqual({ body: 'changed' });
  });

  it('never mutates the input tree', () => {
    const original = tree();
    const snapshot = JSON.parse(JSON.stringify(original));
    updateBlockProps(original, 'hero-1', { title: 'New' });
    expect(original).toEqual(snapshot);
  });

  it('leaves the tree unchanged for an unknown id', () => {
    const original = tree();
    const result = updateBlockProps(original, 'ghost', { x: 1 });
    expect(result).toEqual(original);
  });
});

describe('updateBlockStyleOverride', () => {
  it('sets styleOverride on a top-level block with none yet', () => {
    const result = updateBlockStyleOverride(tree(), 'hero-1', {
      base: { backgroundColor: '#ff0000' },
    });
    expect(result[0].styleOverride).toEqual({
      base: { backgroundColor: '#ff0000' },
    });
  });

  it('replaces the whole styleOverride, not a field-by-field merge', () => {
    const blocks: Block[] = [
      {
        id: 'hero-1',
        type: 'Hero',
        props: {},
        styleOverride: {
          base: { backgroundColor: '#000000', borderRadius: '4px' },
        },
      },
    ];
    const result = updateBlockStyleOverride(blocks, 'hero-1', {
      base: { backgroundColor: '#ff0000' },
    });
    expect(result[0].styleOverride).toEqual({
      base: { backgroundColor: '#ff0000' },
    });
  });

  it('updates a block nested inside children', () => {
    const result = updateBlockStyleOverride(tree(), 'text-1', {
      base: { textColor: '#111111' },
    });
    expect(result[1].children?.[0].styleOverride).toEqual({
      base: { textColor: '#111111' },
    });
  });

  it('never mutates the input tree', () => {
    const original = tree();
    const snapshot = JSON.parse(JSON.stringify(original));
    updateBlockStyleOverride(original, 'hero-1', {
      base: { backgroundColor: '#fff' },
    });
    expect(original).toEqual(snapshot);
  });

  it('leaves the tree unchanged for an unknown id', () => {
    const original = tree();
    const result = updateBlockStyleOverride(original, 'ghost', {
      base: { backgroundColor: '#fff' },
    });
    expect(result).toEqual(original);
  });
});

describe('removeBlock', () => {
  it('removes a top-level block', () => {
    const result = removeBlock(tree(), 'hero-1');
    expect(result.map((b) => b.id)).toEqual(['container-1']);
  });

  it('removes a block nested inside children', () => {
    const result = removeBlock(tree(), 'text-1');
    expect(result[1].children).toEqual([]);
  });
});

describe('insertBlock', () => {
  it('inserts at the root at the given index', () => {
    const newBlock: Block = { id: 'new-1', type: 'Text', props: {} };
    const result = insertBlock(tree(), newBlock, { parentId: null, index: 1 });
    expect(result.map((b) => b.id)).toEqual(['hero-1', 'new-1', 'container-1']);
  });

  it('inserts inside a specific parent, at the given index', () => {
    const newBlock: Block = { id: 'new-1', type: 'Text', props: {} };
    const result = insertBlock(tree(), newBlock, {
      parentId: 'container-1',
      index: 0,
    });
    const container = result.find((b) => b.id === 'container-1');
    expect(container?.children?.map((c) => c.id)).toEqual(['new-1', 'text-1']);
  });

  it('leaves the tree unchanged for an unknown parentId', () => {
    const original = tree();
    const newBlock: Block = { id: 'new-1', type: 'Text', props: {} };
    const result = insertBlock(original, newBlock, {
      parentId: 'ghost',
      index: 0,
    });
    expect(result).toEqual(original);
  });
});

describe('moveBlock', () => {
  it('moves a top-level block to a new parent, preserving its own children', () => {
    const result = moveBlock(tree(), 'hero-1', {
      parentId: 'container-1',
      index: 0,
    });
    expect(result.map((b) => b.id)).toEqual(['container-1']);
    const container = result[0];
    expect(container.children?.map((c) => c.id)).toEqual(['hero-1', 'text-1']);
  });

  it('moves a nested block back to the root', () => {
    const result = moveBlock(tree(), 'text-1', { parentId: null, index: 0 });
    expect(result.map((b) => b.id)).toEqual([
      'text-1',
      'hero-1',
      'container-1',
    ]);
    expect(result[2].children).toEqual([]);
  });

  it('leaves the tree unchanged for an unknown blockId', () => {
    const original = tree();
    const result = moveBlock(original, 'ghost', { parentId: null, index: 0 });
    expect(result).toEqual(original);
  });
});

describe('locateBlock', () => {
  it('returns parentId: null and its index for a root-level block', () => {
    expect(locateBlock(tree(), 'container-1')).toEqual({
      parentId: null,
      index: 1,
    });
  });

  it("returns the real parent's id and index for a nested block", () => {
    expect(locateBlock(tree(), 'text-1')).toEqual({
      parentId: 'container-1',
      index: 0,
    });
  });

  it('returns null for an unknown id', () => {
    expect(locateBlock(tree(), 'ghost')).toBeNull();
  });
});

describe('siblingsAt', () => {
  it('returns the root blocks when parentId is null', () => {
    expect(siblingsAt(tree(), null).map((b) => b.id)).toEqual([
      'hero-1',
      'container-1',
    ]);
  });

  it("returns a container's children", () => {
    expect(siblingsAt(tree(), 'container-1').map((b) => b.id)).toEqual([
      'text-1',
    ]);
  });

  it('returns an empty array for a block with no children yet', () => {
    expect(siblingsAt(tree(), 'hero-1')).toEqual([]);
  });

  it('returns an empty array for an unknown parentId', () => {
    expect(siblingsAt(tree(), 'ghost')).toEqual([]);
  });
});

describe('blockIds', () => {
  it('returns the ids in list order', () => {
    expect(blockIds(tree())).toEqual(['hero-1', 'container-1']);
  });

  it('drops a block with no id rather than yielding undefined', () => {
    // The reason this is a filter and not a cast: the result is handed to
    // moveBlock and to the preview bridge, both of which take string[].
    // An `undefined` in there fails silently — nothing throws, the block
    // just never moves.
    const blocks: Block[] = [
      { id: 'a', type: 'Text', props: {} },
      { type: 'Text', props: {} },
      { id: 'c', type: 'Text', props: {} },
    ];
    expect(blockIds(blocks)).toEqual(['a', 'c']);
  });

  it('is flat: nested children are not included', () => {
    // text-1 lives inside container-1. Reordering is always scoped to one
    // set of siblings, so a nested id here would be a bug, not a bonus.
    expect(blockIds(tree())).not.toContain('text-1');
  });
});

describe('cloneBlockWithNewIds', () => {
  it('copies type and props, but assigns a new id', () => {
    const [hero] = tree();
    const clone = cloneBlockWithNewIds(hero);

    expect(clone.id).not.toBe(hero.id);
    expect(clone.type).toBe('Hero');
    expect(clone.props).toEqual(hero.props);
  });

  it('does not share the props object with the original (a later edit to one leaves the other untouched)', () => {
    const [hero] = tree();
    const clone = cloneBlockWithNewIds(hero);

    clone.props['title'] = 'Changed on the clone';

    expect(hero.props['title']).toBe('Old');
  });

  it('recursively assigns new ids to every nested child, never reusing the original ids', () => {
    const [, container] = tree();
    const clone = cloneBlockWithNewIds(container);

    expect(clone.id).not.toBe(container.id);
    expect(clone.children).toHaveLength(1);
    expect(clone.children?.[0].id).not.toBe(container.children?.[0].id);
    expect(clone.children?.[0].type).toBe('Text');
    expect(clone.children?.[0].props).toEqual(container.children?.[0].props);
  });

  it('gives every clone a distinct id, even across repeated calls', () => {
    const [hero] = tree();
    const first = cloneBlockWithNewIds(hero);
    const second = cloneBlockWithNewIds(hero);

    expect(first.id).not.toBe(second.id);
  });
});

describe('createBlockFromDescriptor', () => {
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
  const columnDescriptor: BlockDescriptor = {
    type: 'Column',
    label: 'Colonna',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
  };
  const columnsDescriptor: BlockDescriptor = {
    type: 'Columns',
    label: 'Colonne',
    category: 'layout',
    defaultProps: { layout: 'two-equal' },
    fields: [],
    isContainer: true,
    allowedChildTypes: ['Column'],
  };
  const testimonialDescriptor: BlockDescriptor = {
    type: 'Testimonial',
    label: 'Testimonianza',
    category: 'socialProof',
    defaultProps: { quote: 'Testo della recensione...' },
    fields: [],
  };
  const testimonialsDescriptor: BlockDescriptor = {
    type: 'Testimonials',
    label: 'Testimonianze/recensioni',
    category: 'socialProof',
    defaultProps: {},
    fields: [],
    isContainer: true,
    allowedChildTypes: ['Testimonial'],
  };
  const registry = [
    heroDescriptor,
    containerDescriptor,
    columnDescriptor,
    columnsDescriptor,
    testimonialDescriptor,
    testimonialsDescriptor,
  ];

  it('gives a non-container block its default props and a fresh id, no children key', () => {
    const block = createBlockFromDescriptor(heroDescriptor, registry);

    expect(block.type).toBe('Hero');
    expect(block.props).toEqual({ title: 'Titolo' });
    expect(block.id).toBeTruthy();
    expect(block.children).toBeUndefined();
  });

  it('leaves a generic container (no allowedChildTypes) empty — there is no single canonical child to seed', () => {
    const block = createBlockFromDescriptor(containerDescriptor, registry);

    expect(block.children).toEqual([]);
  });

  it('seeds a "collection" container (exactly one allowedChildTypes entry) with one child of that type, using the child descriptor\'s own default props', () => {
    const block = createBlockFromDescriptor(testimonialsDescriptor, registry);

    expect(block.children).toHaveLength(1);
    expect(block.children?.[0]).toMatchObject({
      type: 'Testimonial',
      props: { quote: 'Testo della recensione...' },
    });
    expect(block.children?.[0].id).toBeTruthy();
  });

  it('seeds Columns with two Columns', () => {
    const block = createBlockFromDescriptor(columnsDescriptor, registry);

    expect(block.children).toHaveLength(2);
    expect(block.children?.every((child) => child.type === 'Column')).toBe(
      true,
    );
  });

  it('seeds each Column without a width, so the row splits itself', () => {
    // The count is a starting point, not a layout (ADR-0050): with no
    // `span` anywhere, `resolveColumnSpans` divides the row equally, and
    // adding a third column re-divides it with nothing to update by hand.
    // The three fixed presets this replaced could only ever produce two
    // or three columns, and a Column could not be resized at all.
    const block = createBlockFromDescriptor(columnsDescriptor, registry);

    expect(block.children?.map((child) => child.props)).toEqual([{}, {}]);
  });

  it('gives each seeded Column a distinct id, and leaves it empty (a Column has no canonical child of its own)', () => {
    const block = createBlockFromDescriptor(columnsDescriptor, registry);
    const [first, second] = block.children ?? [];

    expect(first?.id).not.toBe(second?.id);
    expect(first?.children).toEqual([]);
  });

  it('leaves the container empty (instead of throwing) if its declared child type is missing from the registry', () => {
    const orphanDescriptor: BlockDescriptor = {
      type: 'Orphan',
      label: 'Orfano',
      category: 'content',
      defaultProps: {},
      fields: [],
      isContainer: true,
      allowedChildTypes: ['Ghost'],
    };

    const block = createBlockFromDescriptor(orphanDescriptor, [
      orphanDescriptor,
    ]);

    expect(block.children).toEqual([]);
  });
});

describe('blockAncestry', () => {
  const tree: Block[] = [
    { id: 'a', type: 'Hero', props: {} },
    {
      id: 'b',
      type: 'Columns',
      props: {},
      children: [
        {
          id: 'c',
          type: 'Column',
          props: {},
          children: [{ id: 'd', type: 'Text', props: {} }],
        },
      ],
    },
  ];

  it('returns the chain down to the block, the block included', () => {
    expect(blockAncestry(tree, 'd').map((block) => block.id)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('returns just the block itself at the root', () => {
    expect(blockAncestry(tree, 'a').map((block) => block.id)).toEqual(['a']);
  });

  /*
   * A selection can outlive the block it pointed at for one render, after
   * an undo or a delete — the caller renders nothing rather than crashing.
   */
  it('returns nothing for a block that is no longer there', () => {
    expect(blockAncestry(tree, 'gone')).toEqual([]);
  });
});

describe('canHoldChild', () => {
  const plain: BlockDescriptor = {
    type: 'Heading',
    label: 'Heading',
    category: 'content',
    defaultProps: {},
    fields: [],
  };
  const generic: BlockDescriptor = {
    ...plain,
    type: 'Column',
    isContainer: true,
  };
  const collection: BlockDescriptor = {
    ...plain,
    type: 'Testimonials',
    isContainer: true,
    allowedChildTypes: ['Testimonial'],
  };

  it('lets nothing into a block that is not a container', () => {
    expect(canHoldChild(plain, 'Text')).toBe(false);
    expect(canHoldChild(undefined, 'Text')).toBe(false);
  });

  it('lets anything into a container with no list', () => {
    expect(canHoldChild(generic, 'Heading')).toBe(true);
  });

  it('lets only its listed types into a container with a list', () => {
    expect(canHoldChild(collection, 'Testimonial')).toBe(true);
    expect(canHoldChild(collection, 'Heading')).toBe(false);
  });
});

describe('nearestTargetThatHolds', () => {
  const registry: BlockDescriptor[] = [
    {
      type: 'Column',
      label: 'Column',
      category: 'layout',
      defaultProps: {},
      fields: [],
      isContainer: true,
    },
    {
      type: 'Testimonials',
      label: 'Testimonials',
      category: 'socialProof',
      defaultProps: {},
      fields: [],
      isContainer: true,
      allowedChildTypes: ['Testimonial'],
    },
  ];
  const tree: Block[] = [
    {
      id: 'col',
      type: 'Column',
      props: {},
      children: [
        { id: 'first', type: 'Heading', props: {} },
        { id: 'testi', type: 'Testimonials', props: {}, children: [] },
      ],
    },
  ];

  it('keeps a target whose parent accepts every type', () => {
    expect(
      nearestTargetThatHolds(tree, registry, { parentId: 'testi', index: 0 }, [
        'Testimonial',
      ]),
    ).toEqual({ parentId: 'testi', index: 0 });
  });

  it('steps out to just after the parent that refuses, one level up', () => {
    expect(
      nearestTargetThatHolds(tree, registry, { parentId: 'testi', index: 0 }, [
        'Heading',
      ]),
    ).toEqual({ parentId: 'col', index: 2 });
  });

  it('refuses a strip if any one of its types is refused', () => {
    expect(
      nearestTargetThatHolds(tree, registry, { parentId: 'testi', index: 0 }, [
        'Testimonial',
        'Heading',
      ]),
    ).toEqual({ parentId: 'col', index: 2 });
  });

  it('always has the root to fall back on', () => {
    expect(
      nearestTargetThatHolds(tree, registry, { parentId: null, index: 1 }, [
        'Anything',
      ]),
    ).toEqual({ parentId: null, index: 1 });
  });
});

/*
 * A container says what it takes; a child says where it belongs. A Tab
 * outside Tabs is a panel with no tab to open it, so the rule has to ask
 * both ends — `allowedChildTypes` alone let the page root hold anything.
 */
describe('canPlace', () => {
  const tabs: BlockDescriptor = {
    type: 'Tabs',
    label: 'Tabs',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
    allowedChildTypes: ['Tab'],
  };
  const tab: BlockDescriptor = {
    type: 'Tab',
    label: 'Tab',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
    allowedParentTypes: ['Tabs'],
  };
  const box: BlockDescriptor = {
    type: 'Container',
    label: 'Container',
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer: true,
  };
  const heading: BlockDescriptor = {
    type: 'Heading',
    label: 'Heading',
    category: 'content',
    defaultProps: {},
    fields: [],
  };
  const registry = [tabs, tab, box, heading];

  it('lets a block with no parents named sit at the top level', () => {
    expect(canPlace(registry, null, 'Heading')).toBe(true);
  });

  it('keeps a block that names its parents off the top level', () => {
    expect(canPlace(registry, null, 'Tab')).toBe(false);
  });

  it('keeps it out of a container that is not one of them', () => {
    expect(canPlace(registry, 'Container', 'Tab')).toBe(false);
  });

  it('puts it inside the container it names', () => {
    expect(canPlace(registry, 'Tabs', 'Tab')).toBe(true);
  });

  it('still asks the container what it takes', () => {
    expect(canPlace(registry, 'Tabs', 'Heading')).toBe(false);
    expect(canPlace(registry, 'Container', 'Heading')).toBe(true);
  });

  it('has nowhere to put a child-only block when its container is not in the tree', () => {
    const tree: Block[] = [
      { id: 'box', type: 'Container', props: {}, children: [] },
    ];

    expect(
      nearestTargetThatHolds(tree, registry, { parentId: 'box', index: 0 }, [
        'Tab',
      ]),
    ).toBeNull();
  });

  it('finds the container it belongs in when the aim was a child of it', () => {
    const tree: Block[] = [
      {
        id: 'tabs',
        type: 'Tabs',
        props: {},
        children: [{ id: 'tab-1', type: 'Tab', props: {}, children: [] }],
      },
    ];

    expect(
      nearestTargetThatHolds(tree, registry, { parentId: 'tab-1', index: 0 }, [
        'Tab',
      ]),
    ).toEqual({ parentId: 'tabs', index: 1 });
  });
});

describe('countBlocks', () => {
  it('counts every block at every depth', () => {
    const tree: Block[] = [
      {
        id: 'cols',
        type: 'Columns',
        props: {},
        children: [
          {
            id: 'col',
            type: 'Column',
            props: {},
            children: [{ id: 't', type: 'Text', props: {} }],
          },
        ],
      },
      { id: 'h', type: 'Hero', props: {} },
    ];

    expect(countBlocks(tree)).toBe(4);
    expect(countBlocks([])).toBe(0);
  });
});
