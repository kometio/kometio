import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-registry';
import { COMMERCE_BLOCK_TYPES } from '@kometio/shared-types';
import { withoutHiddenBlocks } from './use-page-block-registry';

const descriptor = (type: string, category: string): BlockDescriptor => ({
  type,
  label: `blocks.${type}.label`,
  category,
  defaultProps: {},
  fields: [],
});

describe('withoutHiddenBlocks', () => {
  it('stops offering a type the free core hides', () => {
    const { categories } = withoutHiddenBlocks({
      registry: [
        descriptor('Heading', 'content'),
        descriptor('BuyButton', 'shop'),
      ],
      categories: [
        { title: 'blocks.categories.content', types: ['Heading', 'BuyButton'] },
      ],
    });

    expect(categories).toEqual([
      { title: 'blocks.categories.content', types: ['Heading'] },
    ]);
  });

  /**
   * The shop bucket is exactly the hidden set today, so it comes out of
   * here with nothing in it — and stops there. `BlockPicker` is what
   * drops a category with no blocks left (`.filter((category) =>
   * category.descriptors.length > 0)`), which it has to do anyway for
   * searching and `canInsert`; writing the same rule again here would
   * mean two places to change it.
   */
  it('empties a category whose every block is hidden, and leaves the dropping to the picker', () => {
    const { categories } = withoutHiddenBlocks({
      registry: [descriptor('BuyButton', 'shop')],
      categories: [
        { title: 'blocks.categories.content', types: ['Heading'] },
        {
          title: 'blocks.categories.shop',
          types: ['BuyButton', 'ProductCard'],
        },
      ],
    });

    expect(categories).toEqual([
      { title: 'blocks.categories.content', types: ['Heading'] },
      { title: 'blocks.categories.shop', types: [] },
    ]);
  });

  /**
   * The whole point of hiding rather than removing: a page saved with one
   * of these still has to open. The inspector and the canvas resolve a
   * block through `registry`, so what the picker stops offering must
   * still be in there.
   */
  it('leaves the registry whole, so a page already holding one still opens', () => {
    const { registry } = withoutHiddenBlocks({
      registry: [
        descriptor('Heading', 'content'),
        descriptor('BuyButton', 'shop'),
      ],
      categories: [{ title: 'blocks.categories.shop', types: ['BuyButton'] }],
    });

    expect(registry.map((block) => block.type)).toEqual([
      'Heading',
      'BuyButton',
    ]);
  });

  /**
   * A theme is allowed to ship its own shop block (ADR-0041 files it into
   * core's bucket by category). Hiding core's commerce blocks must not
   * take a theme's down with them — which is why the filter runs on type
   * names after the merge, not on the category.
   */
  it('keeps a category a theme block has joined', () => {
    const { categories } = withoutHiddenBlocks({
      registry: [descriptor('AcmeProduct', 'shop')],
      categories: [
        {
          title: 'blocks.categories.shop',
          types: ['BuyButton', 'AcmeProduct'],
        },
      ],
    });

    expect(categories).toEqual([
      { title: 'blocks.categories.shop', types: ['AcmeProduct'] },
    ]);
  });

  it('leaves a category with nothing hidden in it untouched', () => {
    const categories = [
      { title: 'blocks.categories.content', types: ['Heading', 'Text'] },
    ];

    expect(
      withoutHiddenBlocks({ registry: [], categories }).categories,
    ).toEqual(categories);
  });

  /**
   * Reads the real list rather than a fixture: a name added to it has to
   * actually disappear from the picker, and a filter written against a
   * hard-coded copy would keep passing while the product changed.
   */
  it('hides every type the commerce list names', () => {
    const { categories } = withoutHiddenBlocks({
      registry: [],
      categories: [
        {
          title: 'blocks.categories.shop',
          types: [...COMMERCE_BLOCK_TYPES, 'Heading'],
        },
      ],
    });

    expect(categories).toEqual([
      { title: 'blocks.categories.shop', types: ['Heading'] },
    ]);
  });
});
