import { describe, expect, it } from 'vitest';
import {
  checkOverridesDrawVariants,
  checkVariantsAgainstCore,
  collectThemeVariantExtensions,
  validateThemeVariantExtensions,
  type ThemeBlockVariant,
} from './theme-block-variants';

const LOCALES = ['en', 'it'];
const ghost: ThemeBlockVariant = {
  value: 'ghost',
  label: { en: 'Ghost', it: 'Fantasma' },
};

describe('collectThemeVariantExtensions', () => {
  it('reads the block type from the file name', () => {
    expect(
      collectThemeVariantExtensions({
        '../../themes/acme/blocks/Button.variants.ts': { default: [ghost] },
      }),
    ).toEqual([{ blockType: 'Button', hides: [], variants: [ghost] }]);
  });
});

describe('validateThemeVariantExtensions', () => {
  it('accepts a well-formed extension', () => {
    expect(
      validateThemeVariantExtensions(
        [{ blockType: 'Button', hides: [], variants: [ghost] }],
        LOCALES,
      ),
    ).toEqual([]);
  });

  // The value becomes a CSS class, so it goes through the same character
  // rule as everything else that reaches a selector (PR #144).
  it.each([
    'Ghost',
    'ghost button',
    '--ghost',
    'ghost; } body { display: none } .x {',
    '',
  ])('refuses %s as a variant name', (value) => {
    const errors = validateThemeVariantExtensions(
      [
        {
          blockType: 'Button',
          hides: [],
          variants: [{ value, label: { en: 'x', it: 'x' } }],
        },
      ],
      LOCALES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('CSS class');
  });

  it("refuses the reserved name for the type's own look", () => {
    const errors = validateThemeVariantExtensions(
      [
        {
          blockType: 'Button',
          hides: [],
          variants: [{ value: 'default', label: { en: 'x', it: 'x' } }],
        },
      ],
      LOCALES,
    );
    expect(errors[0].message).toContain('reserved');
  });

  /**
   * A label missing in one language is the kind of thing that ships: the
   * author works in their own locale, sees it fill in, and never opens
   * the other one. The editor would show a raw i18n key to the client.
   */
  it('refuses a variant with no label in one of the locales', () => {
    const errors = validateThemeVariantExtensions(
      [
        {
          blockType: 'Button',
          hides: [],
          variants: [{ value: 'ghost', label: { en: 'Ghost' } }],
        },
      ],
      LOCALES,
    );
    expect(errors[0].message).toContain('no label for it');
  });

  it('refuses the same variant declared twice', () => {
    const errors = validateThemeVariantExtensions(
      [{ blockType: 'Button', hides: [], variants: [ghost, ghost] }],
      LOCALES,
    );
    expect(errors[0].message).toContain('declared twice');
  });

  it('refuses a file that adds nothing and hides nothing', () => {
    expect(
      validateThemeVariantExtensions(
        [{ blockType: 'Button', hides: [], variants: [] }],
        LOCALES,
      )[0].message,
    ).toContain('adds no look and hides none');
  });

  /*
   * A theme that draws a block its own way may leave a core look out; the
   * editor then stops offering it. The names are checked like any other.
   */
  it('accepts a file that only hides core looks', () => {
    expect(
      validateThemeVariantExtensions(
        [{ blockType: 'Button', hides: ['outline', 'link'], variants: [] }],
        LOCALES,
      ),
    ).toEqual([]);
  });

  it.each([
    [['default'], 'cannot be hidden'],
    [['Link'], 'not a variant name'],
    [['link', 'link'], 'hidden twice'],
  ])('refuses hiding %j', (hides, message) => {
    const errors = validateThemeVariantExtensions(
      [{ blockType: 'Button', hides, variants: [] }],
      LOCALES,
    );
    expect(errors[0].message).toContain(message);
  });

  it('refuses a look both added and hidden', () => {
    const errors = validateThemeVariantExtensions(
      [{ blockType: 'Button', hides: ['ghost'], variants: [ghost] }],
      LOCALES,
    );
    expect(errors[0].message).toContain('both added and hidden');
  });
});

describe('checkVariantsAgainstCore', () => {
  const core = { Button: ['secondary'] };
  const types = ['Button', 'Hero'];

  it('accepts a look the core block does not have', () => {
    expect(
      checkVariantsAgainstCore(
        [{ blockType: 'Button', hides: [], variants: [ghost] }],
        core,
        types,
      ),
    ).toEqual([]);
  });

  // Almost always a typo in the file name, and one that would otherwise
  // sit there declaring looks nobody can pick, with nothing failing.
  it('refuses extending a type that does not exist', () => {
    const errors = checkVariantsAgainstCore(
      [{ blockType: 'Buttton', hides: [], variants: [ghost] }],
      core,
      types,
    );
    expect(errors[0].message).toContain('not a core block type');
  });

  it("refuses redeclaring one of the block's own looks", () => {
    const errors = checkVariantsAgainstCore(
      [
        {
          blockType: 'Button',
          hides: [],
          variants: [{ value: 'secondary', label: { en: 'S', it: 'S' } }],
        },
      ],
      core,
      types,
    );
    expect(errors[0].message).toContain('already one of this block');
  });

  // A typo would hide nothing, and nothing would say so.
  it('refuses hiding a look the block does not have', () => {
    const errors = checkVariantsAgainstCore(
      [{ blockType: 'Button', hides: ['secondry'], variants: [] }],
      core,
      types,
    );
    expect(errors[0].message).toContain('not one of this block');
  });

  it("accepts hiding one of the block's own looks", () => {
    expect(
      checkVariantsAgainstCore(
        [{ blockType: 'Button', hides: ['secondary'], variants: [] }],
        core,
        types,
      ),
    ).toEqual([]);
  });
});

describe('checkOverridesDrawVariants', () => {
  const core = { Button: ['outline', 'link'], FeatureGrid: ['cards'] };

  it('accepts a replacement that draws every core look', () => {
    expect(
      checkOverridesDrawVariants(
        {
          Button: '.kometio-button--outline {} .kometio-button--link {}',
          FeatureGrid: '.kometio-feature-grid--cards {}',
        },
        [],
        core,
      ),
    ).toEqual([]);
  });

  it('names each look a replacement drops without saying so', () => {
    const errors = checkOverridesDrawVariants(
      { Button: '.kometio-button--outline {}' },
      [],
      core,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('.kometio-button--link');
  });

  it('accepts a dropped look the theme hides', () => {
    expect(
      checkOverridesDrawVariants(
        { Button: '.kometio-button--outline {}' },
        [{ blockType: 'Button', variants: [], hides: ['link'] }],
        core,
      ),
    ).toEqual([]);
  });

  it("skips the theme's own block types", () => {
    expect(checkOverridesDrawVariants({ StatusBadge: '' }, [], core)).toEqual(
      [],
    );
  });
});
