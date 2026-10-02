import { describe, expect, it } from 'vitest';
import {
  checkStylePropertiesAgainstCore,
  collectThemeStyleProperties,
  CORE_STYLE_PROPERTY_KEYS,
  validateThemeStyleProperties,
  type ThemeStyleProperty,
} from './theme-style-properties';

const LOCALES = ['en', 'it'];
const elevation: ThemeStyleProperty = {
  key: 'cardElevation',
  control: 'length',
  label: { en: 'Elevation', it: 'Elevazione' },
  placeholder: '4px',
};

describe('CORE_STYLE_PROPERTY_KEYS', () => {
  // Read from the schema rather than repeated, so it is the one list in
  // this file that cannot drift: it IS the source.
  it('is the schema’s own property list', () => {
    expect(CORE_STYLE_PROPERTY_KEYS).toContain('backgroundColor');
    expect(CORE_STYLE_PROPERTY_KEYS).toContain('marginBottom');
    expect(CORE_STYLE_PROPERTY_KEYS.length).toBeGreaterThan(15);
  });
});

describe('collectThemeStyleProperties', () => {
  it('reads the block type from the file name', () => {
    expect(
      collectThemeStyleProperties({
        '../../themes/acme/blocks/Card.style.ts': { default: [elevation] },
      }),
    ).toEqual([{ blockType: 'Card', properties: [elevation] }]);
  });
});

describe('validateThemeStyleProperties', () => {
  it('accepts a well-formed property', () => {
    expect(
      validateThemeStyleProperties(
        [{ blockType: 'Card', properties: [elevation] }],
        LOCALES,
      ),
    ).toEqual([]);
  });

  // The key becomes a CSS custom property name, so it goes through the
  // same discipline as every other value that reaches a stylesheet.
  it.each(['card elevation', 'CardElevation', '--evil', ''])(
    'refuses %s as a property key',
    (key) => {
      const errors = validateThemeStyleProperties(
        [
          {
            blockType: 'Card',
            properties: [{ ...elevation, key }],
          },
        ],
        LOCALES,
      );
      expect(errors[0].message).toContain('CSS custom property');
    },
  );

  it('refuses a select with no options', () => {
    const errors = validateThemeStyleProperties(
      [
        {
          blockType: 'Card',
          properties: [{ ...elevation, control: 'select' }],
        },
      ],
      LOCALES,
    );
    expect(errors[0].message).toContain('no options');
  });

  it('refuses an unknown control', () => {
    const errors = validateThemeStyleProperties(
      [
        {
          blockType: 'Card',
          properties: [
            {
              ...elevation,
              control: 'slider' as ThemeStyleProperty['control'],
            },
          ],
        },
      ],
      LOCALES,
    );
    expect(errors[0].message).toContain('no usable control');
  });

  /**
   * A label missing in one language is the kind of thing that ships: the
   * author works in their own locale and never opens the other. The
   * agency would see a raw i18n key in the style panel.
   */
  it('refuses a property with no label in one of the locales', () => {
    const errors = validateThemeStyleProperties(
      [
        {
          blockType: 'Card',
          properties: [{ ...elevation, label: { en: 'Elevation' } }],
        },
      ],
      LOCALES,
    );
    expect(errors[0].message).toContain('no label for it');
  });

  it('refuses the same key declared twice', () => {
    const errors = validateThemeStyleProperties(
      [{ blockType: 'Card', properties: [elevation, elevation] }],
      LOCALES,
    );
    expect(errors[0].message).toContain('declared twice');
  });
});

describe('checkStylePropertiesAgainstCore', () => {
  it('accepts a property core does not have', () => {
    expect(
      checkStylePropertiesAgainstCore(
        [{ blockType: 'Card', properties: [elevation] }],
        ['Card'],
      ),
    ).toEqual([]);
  });

  it('refuses extending a type that does not exist', () => {
    const errors = checkStylePropertiesAgainstCore(
      [{ blockType: 'Crad', properties: [elevation] }],
      ['Card'],
    );
    expect(errors[0].message).toContain('not a core block type');
  });

  // Two controls writing the same key, one of them shadowing the other.
  it('refuses redeclaring a property core already ships', () => {
    const errors = checkStylePropertiesAgainstCore(
      [
        {
          blockType: 'Card',
          properties: [{ ...elevation, key: 'backgroundColor' }],
        },
      ],
      ['Card'],
    );
    expect(errors[0].message).toContain('core already ships');
  });
});
