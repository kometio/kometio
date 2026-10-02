import { describe, expect, it } from 'vitest';
import {
  FieldBuilder,
  headerFooterBlocks,
  pageBlocks,
  type BlockDescriptor,
} from '@kometio/block-registry';
import type { Block } from '@kometio/shared-types';
import {
  findMissingThemeIcons,
  isIconMissingFromTheme,
  withoutMissingThemeIcons,
} from './missing-theme-icons';

describe('isIconMissingFromTheme', () => {
  const theme = new Set(['database', 'globe']);

  it('is missing when the theme set does not have it', () => {
    expect(isIconMissingFromTheme('palette', theme)).toBe(true);
    expect(isIconMissingFromTheme('globe', theme)).toBe(false);
  });

  it('says nothing while the set is still loading', () => {
    expect(isIconMissingFromTheme('palette', undefined)).toBe(false);
  });

  it('never flags a logo or a media image: neither comes from the theme', () => {
    expect(isIconMissingFromTheme('brand:github', theme)).toBe(false);
    expect(
      isIconMissingFromTheme('media:m1:https://example.com/a.png', theme),
    ).toBe(false);
  });
});

describe('findMissingThemeIcons', () => {
  // The real core descriptors: which fields hold an icon, and when the
  // List's is shown, are theirs to say.
  const registry = [...pageBlocks, ...headerFooterBlocks];
  const lacks = (value: string) => value === 'palette' || value === 'puzzle';

  it('finds a missing icon at any depth, keyed by the block that stores it', () => {
    const blocks: Block[] = [
      {
        id: 'grid-1',
        type: 'FeatureGrid',
        props: {},
        children: [
          { id: 'feature-1', type: 'Feature', props: { icon: 'palette' } },
          { id: 'feature-2', type: 'Feature', props: { icon: 'globe' } },
        ],
      },
      { id: 'button-1', type: 'Button', props: { icon: 'puzzle' } },
    ];

    expect(findMissingThemeIcons(blocks, registry, lacks)).toEqual(
      new Map([
        ['feature-1', ['palette']],
        ['button-1', ['puzzle']],
      ]),
    );
  });

  it("skips an icon field that is not shown: a List's icon only counts as its marker", () => {
    const list = (marker: string): Block[] => [
      { id: 'list-1', type: 'List', props: { marker, icon: 'palette' } },
    ];

    expect(findMissingThemeIcons(list('bullet'), registry, lacks).size).toBe(0);
    expect(findMissingThemeIcons(list('icon'), registry, lacks)).toEqual(
      new Map([['list-1', ['palette']]]),
    );
  });

  it("counts a theme block's icon fields whatever their key", () => {
    const themeBlock: BlockDescriptor = {
      type: 'Stat',
      label: 'Stat',
      category: 'content',
      defaultProps: {},
      fields: [
        FieldBuilder.custom('leading', 'Leading', 'icon'),
        FieldBuilder.custom('trailing', 'Trailing', 'icon'),
      ],
    };
    const blocks: Block[] = [
      {
        id: 'stat-1',
        type: 'Stat',
        props: { leading: 'palette', trailing: 'globe' },
      },
    ];

    expect(findMissingThemeIcons(blocks, [themeBlock], lacks)).toEqual(
      new Map([['stat-1', ['palette']]]),
    );
  });

  it('ignores no icon, a block of unknown type, and a block with no id to mark', () => {
    const blocks: Block[] = [
      { id: 'feature-1', type: 'Feature', props: { icon: null } },
      { id: 'feature-2', type: 'Feature', props: { icon: '' } },
      { id: 'mystery-1', type: 'Mystery', props: { icon: 'palette' } },
      { type: 'Feature', props: { icon: 'palette' } },
    ];

    expect(findMissingThemeIcons(blocks, registry, lacks).size).toBe(0);
  });
});

describe('withoutMissingThemeIcons', () => {
  const registry = [...pageBlocks, ...headerFooterBlocks];
  const lacks = (value: string) => value === 'palette';

  it('takes out, at any depth, the icons the theme does not draw, and keeps the rest', () => {
    const blocks: Block[] = [
      {
        id: 'grid-1',
        type: 'FeatureGrid',
        props: { columns: 3 },
        children: [
          { id: 'f1', type: 'Feature', props: { icon: 'palette', title: 'A' } },
          { id: 'f2', type: 'Feature', props: { icon: 'globe', title: 'B' } },
        ],
      },
      // Not shown as a marker, so not the theme's to draw: left alone.
      {
        id: 'list-1',
        type: 'List',
        props: { marker: 'bullet', icon: 'palette' },
      },
    ];

    const cleaned = withoutMissingThemeIcons(blocks, registry, lacks);

    expect(cleaned[0].props).toEqual({ columns: 3 });
    expect(cleaned[0].children?.map((block) => block.props)).toEqual([
      { title: 'A' },
      { icon: 'globe', title: 'B' },
    ]);
    expect(cleaned[1].props['icon']).toBe('palette');
    // A copy: the page the dialog received is not changed under it.
    expect(blocks[0].children?.[0].props['icon']).toBe('palette');
  });
});
