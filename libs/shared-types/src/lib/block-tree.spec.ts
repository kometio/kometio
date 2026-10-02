import { describe, expect, it } from 'vitest';
import type { Block } from './content-model';
import { eachBlock, findBlockById, subtreeIds } from './block-tree';

const tree: Block[] = [
  {
    id: 'cols',
    type: 'Columns',
    props: {},
    children: [
      {
        id: 'left',
        type: 'Column',
        props: {},
        children: [{ id: 'text', type: 'Text', props: {} }],
      },
      { id: 'right', type: 'Column', props: {} },
    ],
  },
  { id: 'hero', type: 'Hero', props: {} },
];

describe('block-tree', () => {
  it('visits every block, each before its children, in page order', () => {
    expect([...eachBlock(tree)].map((block) => block.id)).toEqual([
      'cols',
      'left',
      'text',
      'right',
      'hero',
    ]);
  });

  it('finds a block at any depth, and answers null for none', () => {
    expect(findBlockById(tree, 'text')?.type).toBe('Text');
    expect(findBlockById(tree, 'nessuno')).toBeNull();
  });

  it('gives a block and everything inside it, and nothing beside it', () => {
    expect(subtreeIds(tree, 'left')).toEqual(new Set(['left', 'text']));
    expect(subtreeIds(tree, 'nessuno')).toEqual(new Set());
  });
});
