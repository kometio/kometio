import { describe, expect, it } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { describeSelection } from './canvas-selection';

function descriptor(
  type: string,
  label: string,
  isContainer = false,
): BlockDescriptor {
  return {
    type,
    label,
    category: 'layout',
    defaultProps: {},
    fields: [],
    isContainer,
  };
}

const registry = [
  descriptor('Hero', 'blocks.hero.label'),
  descriptor('Columns', 'blocks.columns.label', true),
  descriptor('Column', 'blocks.column.label', true),
];

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

function select(selectedBlockIds: string[]) {
  return describeSelection(
    tree,
    {
      selectedBlockId: selectedBlockIds.at(-1) ?? null,
      selectedBlockIds,
      blockRects: [],
    },
    registry,
    (key) => `label:${key}`,
  );
}

describe('describeSelection', () => {
  it('describes nothing when nothing is selected', () => {
    const selection = select([]);

    expect(selection.selectedBlock).toBeNull();
    expect(selection.selectedBlocks).toEqual([]);
    expect(selection.canMoveSelectedUp).toBe(false);
    expect(selection.canMoveSelectedDown).toBe(false);
  });

  it('knows a top-level block from a nested one', () => {
    expect(select(['hero']).isSelectedRootLevel).toBe(true);
    expect(select(['col-1']).isSelectedRootLevel).toBe(false);
  });

  it('decides moving up and down among the block’s own siblings, at any depth', () => {
    expect(select(['col-1'])).toMatchObject({
      canMoveSelectedUp: false,
      canMoveSelectedDown: true,
    });
    expect(select(['col-2'])).toMatchObject({
      canMoveSelectedUp: true,
      canMoveSelectedDown: false,
    });
  });

  it('labels the trail from the root down to the selected block', () => {
    expect(select(['col-2']).selectedAncestry).toEqual([
      { id: 'columns', label: 'label:blocks.columns.label' },
      { id: 'col-2', label: 'label:blocks.column.label' },
    ]);
  });

  /*
   * A block deleted or undone away while it was selected must not reach a
   * mutation that would not find it.
   */
  it('drops a selected id that is no longer in the tree', () => {
    expect(select(['hero', 'gone']).selectedBlocks.map((b) => b.id)).toEqual([
      'hero',
    ]);
  });
});
