import { describe, expect, it } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-registry';
import type { ThemeBlockEntry } from '@kometio/shared-types';
import type { BlockPickerCategory } from '../canvas/block-picker';
import { mergeThemeBlocks } from './merge-theme-blocks';

const coreBlocks: BlockDescriptor[] = [
  {
    type: 'Heading',
    label: 'blocks.heading.label',
    category: 'content',
    defaultProps: {},
    fields: [],
  },
];

const coreCategories: BlockPickerCategory[] = [
  { title: 'blocks.categories.layout', types: ['Columns'] },
  { title: 'blocks.categories.content', types: ['Heading'] },
];

function themeEntry(
  overrides: Partial<ThemeBlockEntry['descriptor']> = {},
): ThemeBlockEntry {
  return {
    descriptor: {
      type: 'StatusBadge',
      label: 'blocks.statusBadge.label',
      category: 'content',
      defaultProps: { label: 'Beta', tone: 'info' },
      fields: [],
      ...overrides,
    },
    locales: {
      en: { label: 'Status Badge' },
      it: { label: 'Badge di stato' },
    },
  };
}

describe('mergeThemeBlocks', () => {
  it('appends the theme block to the registry', () => {
    const { registry } = mergeThemeBlocks(coreBlocks, coreCategories, [
      themeEntry(),
    ]);
    expect(registry.map((b) => b.type)).toEqual(['Heading', 'StatusBadge']);
  });

  it('appends the theme block type to the matching category, alongside the core block already there', () => {
    const { categories } = mergeThemeBlocks(coreBlocks, coreCategories, [
      themeEntry(),
    ]);
    const content = categories.find(
      (c) => c.title === 'blocks.categories.content',
    );
    expect(content?.types).toEqual(['Heading', 'StatusBadge']);
  });

  it('leaves other categories untouched', () => {
    const { categories } = mergeThemeBlocks(coreBlocks, coreCategories, [
      themeEntry(),
    ]);
    const layout = categories.find(
      (c) => c.title === 'blocks.categories.layout',
    );
    expect(layout?.types).toEqual(['Columns']);
  });

  it('does not mutate the input arrays', () => {
    const originalCoreBlocksLength = coreBlocks.length;
    const originalContentTypes = [...coreCategories[1].types];
    mergeThemeBlocks(coreBlocks, coreCategories, [themeEntry()]);
    expect(coreBlocks).toHaveLength(originalCoreBlocksLength);
    expect(coreCategories[1].types).toEqual(originalContentTypes);
  });

  it('returns the core registry and categories unchanged when there are no theme entries', () => {
    const { registry, categories } = mergeThemeBlocks(
      coreBlocks,
      coreCategories,
      [],
    );
    expect(registry).toEqual(coreBlocks);
    expect(categories).toEqual(coreCategories);
  });

  it('merges multiple theme blocks into their own respective categories', () => {
    const layoutEntry = themeEntry({
      type: 'Spacer',
      label: 'blocks.spacer.label',
      category: 'layout',
    });
    const { categories } = mergeThemeBlocks(coreBlocks, coreCategories, [
      themeEntry(),
      layoutEntry,
    ]);
    expect(
      categories.find((c) => c.title === 'blocks.categories.content')?.types,
    ).toEqual(['Heading', 'StatusBadge']);
    expect(
      categories.find((c) => c.title === 'blocks.categories.layout')?.types,
    ).toEqual(['Columns', 'Spacer']);
  });
});

/**
 * A theme adding looks to a block core already ships (ADR-0047, under
 * ADR-0048's additive rule) — the whole point being that the core block
 * survives: twenty Figma buttons become twenty looks of the one Button,
 * not twenty block types with duplicated fields.
 */
describe('mergeThemeBlocks with a theme that extends a core block', () => {
  const button: BlockDescriptor = {
    type: 'Button',
    label: 'blocks.button.label',
    category: 'conversion',
    defaultProps: {},
    fields: [],
    variants: [
      { value: 'secondary', label: 'blocks.button.variants.secondary' },
    ],
  };

  it("appends the theme's looks to the block's own", () => {
    const { registry } = mergeThemeBlocks([button], coreCategories, [], {
      Button: {
        variants: [{ value: 'ghost', label: { en: 'Ghost', it: 'Fantasma' } }],
        hidden: [],
      },
    });

    expect(registry[0].variants).toEqual([
      { value: 'secondary', label: 'blocks.button.variants.secondary' },
      // An i18n KEY, exactly like the core one above: the theme's strings
      // are registered into i18next on arrival, so nothing downstream has
      // to ask where a look came from.
      { value: 'ghost', label: 'blocks.button.variants.ghost' },
    ]);
  });

  it('leaves a block the theme says nothing about alone', () => {
    const { registry } = mergeThemeBlocks([button], coreCategories, [], {
      Hero: {
        variants: [{ value: 'split', label: { en: 'Split', it: 'Diviso' } }],
        hidden: [],
      },
    });

    expect(registry[0]).toBe(button);
  });

  // Refused at the source by each theme's own spec; skipped here too,
  // because this runs in a browser against an HTTP response and a
  // duplicate would put the same entry in the picker twice.
  it('skips a look the block already has', () => {
    const { registry } = mergeThemeBlocks([button], coreCategories, [], {
      Button: {
        variants: [{ value: 'secondary', label: { en: 'S', it: 'S' } }],
        hidden: [],
      },
    });

    expect(registry[0].variants).toHaveLength(1);
  });

  it('is unchanged when the theme extends nothing', () => {
    const { registry } = mergeThemeBlocks([button], coreCategories, [], {});
    expect(registry[0]).toBe(button);
  });

  /*
   * A theme that draws the block its own way and leaves a core look out
   * says so; the picker then does not offer a look that would draw
   * nothing.
   */
  it('drops the core looks the theme hides, and keeps what it adds', () => {
    const { registry } = mergeThemeBlocks([button], coreCategories, [], {
      Button: {
        variants: [{ value: 'ghost', label: { en: 'Ghost', it: 'Fantasma' } }],
        hidden: ['secondary'],
      },
    });

    expect(registry[0].variants).toEqual([
      { value: 'ghost', label: 'blocks.button.variants.ghost' },
    ]);
  });
});

/**
 * A theme adding a style property core never heard of (ADR-0047) — the
 * case for it: the theme draws something core has no property for, and
 * wants the AGENCY to tune it from the editor rather than by editing CSS.
 */
describe('mergeThemeBlocks with a theme that adds style properties', () => {
  const code: BlockDescriptor = {
    type: 'Code',
    label: 'blocks.code.label',
    category: 'content',
    defaultProps: {},
    fields: [],
    stylableProperties: ['borderRadius'],
  };

  it("appends the theme's keys after the block's own", () => {
    const { registry } = mergeThemeBlocks(
      [code],
      coreCategories,
      [],
      {},
      {
        Code: [
          {
            key: 'windowTint',
            control: 'color',
            label: { en: 'Window chrome', it: 'Cornice' },
          },
        ],
      },
    );

    // Order matters: `stylableProperties` is what the panel renders, in
    // that sequence, so a theme's additions belong at the end.
    expect(registry[0].stylableProperties).toEqual([
      'borderRadius',
      'windowTint',
    ]);
  });

  it('leaves a block the theme says nothing about alone', () => {
    const { registry } = mergeThemeBlocks(
      [code],
      coreCategories,
      [],
      {},
      {
        Hero: [
          {
            key: 'overlayBlur',
            control: 'length',
            label: { en: 'B', it: 'B' },
          },
        ],
      },
    );

    expect(registry[0]).toBe(code);
  });

  it('skips a key the block already has', () => {
    const { registry } = mergeThemeBlocks(
      [code],
      coreCategories,
      [],
      {},
      {
        Code: [
          {
            key: 'borderRadius',
            control: 'length',
            label: { en: 'R', it: 'R' },
          },
        ],
      },
    );

    expect(registry[0].stylableProperties).toEqual(['borderRadius']);
  });
});
