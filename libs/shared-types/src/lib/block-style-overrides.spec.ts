import { describe, expect, it } from 'vitest';
import {
  blockInstanceClassName,
  blockTypeToClassName,
  blockVariantClassName,
  buildBlockInstanceRulesCss,
  buildBlockStyleOverridesCss,
  buildRootBlockSpacingCss,
  rootBlockHoverAttr,
} from './block-style-overrides';
import { DEFAULT_VARIANT } from './site-theme-tokens';
import type { Block } from './content-model';

describe('blockTypeToClassName', () => {
  it('converts a simple PascalCase type', () => {
    expect(blockTypeToClassName('Button')).toBe('kometio-button');
  });

  it('converts a compound PascalCase type', () => {
    expect(blockTypeToClassName('PromoBar')).toBe('kometio-promo-bar');
    expect(blockTypeToClassName('VideoEmbed')).toBe('kometio-video-embed');
  });
});

describe('buildBlockStyleOverridesCss', () => {
  it("emits one rule per styled block type, scoped by the block's own .kometio-* class", () => {
    // NOT [data-kometio-block-type] — that wrapper only exists when
    // `editable` is true (BlockRenderer.astro), so a rule scoped there
    // would never affect what a real site visitor sees.
    const css = buildBlockStyleOverridesCss({
      Button: {
        default: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
      },
    });

    // Wrapped in its named tier: a per-type rule and a per-instance rule
    // have identical specificity, so without `@layer` the winner would be
    // whichever happened to be emitted last (ADR-0047).
    expect(css).toBe(
      '@layer kometio.class {\n' +
        '.kometio-button { --kometio-override-radius: 9999px; --kometio-override-padding-x: 1.5rem; }\n' +
        '}',
    );
  });

  it('emits nothing (no rule at all) for a type whose override has every field unset', () => {
    const css = buildBlockStyleOverridesCss({
      Button: { default: { base: {} } },
    });

    expect(css).toBe('');
  });

  it('emits one rule per type when multiple types are styled', () => {
    const css = buildBlockStyleOverridesCss({
      Button: { default: { base: { backgroundColor: '#ff0000' } } },
      PromoBar: { default: { base: { paddingY: '2rem' } } },
    });

    expect(css).toBe(
      '@layer kometio.class {\n' +
        '.kometio-button { --kometio-override-bg: #ff0000; }\n' +
        '.kometio-promo-bar { --kometio-override-padding-y: 2rem; }\n' +
        '}',
    );
  });

  it('returns an empty string for an empty map', () => {
    expect(buildBlockStyleOverridesCss({})).toBe('');
  });

  it('never emits a rule for marginTop/marginBottom — they are instance-only, not a per-type CSS override', () => {
    const css = buildBlockStyleOverridesCss({
      Button: {
        default: { base: { marginTop: '1rem', marginBottom: '2rem' } },
      },
    });

    expect(css).toBe('');
  });
});

/**
 * These values are written straight into a `<style>` on the public site,
 * and the block type becomes the selector in front of them. Both were
 * interpolated raw, so anyone with edit rights could close our rule and
 * open one of their own — against a site they do not own.
 *
 * Not theory: `red; } body { … } .x {` produced a valid full-viewport
 * overlay, and `X { } body { display: none } .y` as a block type produced
 * exactly that rule.
 *
 * The schema refuses both at the entrance (site-theme-tokens.spec.ts).
 * This is the second barrier, at the exit, for what the schema cannot
 * see: rows written before it was tightened, a write path that forgets
 * it, a theme supplying its own defaults.
 */
describe('nothing reaches the stylesheet that could escape a declaration', () => {
  const BREAKOUTS = [
    'red; } body { display: none } .x {',
    'red@import url(//evil.example)',
    'red/* } body { display:none } .x { */',
    'red\\3B } body { display:none } .x {',
    '<style>x</style>',
  ];

  it.each(BREAKOUTS)('drops the declaration for %s', (hostile) => {
    expect(
      buildBlockStyleOverridesCss({
        Hero: { default: { base: { backgroundColor: hostile } } },
      }),
    ).toBe('');
    // The per-instance tier is a generated CSS RULE, not an inline
    // style attribute, so a value that escaped its declaration here
    // would escape a stylesheet — the barrier is checked on the path
    // that exists, not on the one this tier used to take.
    expect(
      buildBlockInstanceRulesCss([
        [
          {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            type: 'Hero',
            props: {},
            styleOverride: { base: { backgroundColor: hostile } },
          },
        ],
      ]),
    ).toBe('');
  });

  it('drops a block type that is not an identifier, selector and all', () => {
    expect(
      buildBlockStyleOverridesCss({
        'X { } body { display: none } .y': {
          default: { base: { backgroundColor: 'red' } },
        },
      }),
    ).toBe('');
  });

  it('drops a value long enough to be a payload rather than a colour', () => {
    expect(
      buildBlockStyleOverridesCss({
        Hero: { default: { base: { backgroundColor: 'a'.repeat(201) } } },
      }),
    ).toBe('');
  });

  // The point of a character rule rather than a CSS grammar: everything
  // people actually write still goes through.
  it.each([
    '#fff',
    'oklch(0.7 0.1 250)',
    'rgb(0 0 0 / 50%)',
    'var(--primary)',
    'calc(100% - 2rem)',
    'transparent',
  ])('keeps %s', (value) => {
    expect(
      buildBlockStyleOverridesCss({
        Hero: { default: { base: { backgroundColor: value } } },
      }),
    ).toContain(value);
  });
});

/**
 * The per-instance override stopped being an inline `style` attribute
 * (ADR-0047), for one reason that is not negotiable: **an HTML `style`
 * attribute cannot contain a media query**. Per-breakpoint styling per
 * instance is impossible while the value stays inline, so it became a
 * rule — and a rule needs a class and a named tier to win against the
 * per-type rule it now ties with on specificity.
 */
describe('buildBlockInstanceRulesCss', () => {
  it('emits one rule per styled block, in the instance tier', () => {
    expect(
      buildBlockInstanceRulesCss([
        [
          {
            id: 'a1',
            type: 'Hero',
            props: {},
            styleOverride: { base: { minHeight: '60vh' } },
          },
        ],
      ]),
    ).toBe(
      '@layer kometio.instance {\n.b-a1 { --kometio-override-min-height: 60vh; }\n}',
    );
  });

  it('reaches a styled block nested inside a container', () => {
    const css = buildBlockInstanceRulesCss([
      [
        {
          id: 'c1',
          type: 'Container',
          props: {},
          children: [
            {
              id: 'n1',
              type: 'Text',
              props: {},
              styleOverride: { base: { gap: '2rem' } },
            },
          ],
        },
      ],
    ]);

    expect(css).toContain('.b-n1 { --kometio-override-gap: 2rem; }');
  });

  it('takes header and footer trees alongside the page content', () => {
    const css = buildBlockInstanceRulesCss([
      [
        {
          id: 'p1',
          type: 'Text',
          props: {},
          styleOverride: { base: { gap: '1rem' } },
        },
      ],
      [
        {
          id: 'h1',
          type: 'NavLink',
          props: {},
          styleOverride: { base: { gap: '2rem' } },
        },
      ],
    ]);

    expect(css).toContain('.b-p1');
    expect(css).toContain('.b-h1');
  });

  it('emits nothing when no block is styled, so an ordinary page carries no extra bytes', () => {
    expect(
      buildBlockInstanceRulesCss([[{ id: 'a1', type: 'Hero', props: {} }]]),
    ).toBe('');
  });

  // The block id becomes a selector, so it is checked where it gets there
  // — the same rule the block TYPE key already follows.
  it('drops a block whose id is not one, selector and all', () => {
    expect(
      buildBlockInstanceRulesCss([
        [
          {
            id: 'a" { } body { display: none } .y',
            type: 'Hero',
            props: {},
            styleOverride: { base: { minHeight: '1px' } },
          },
        ],
      ]),
    ).toBe('');
  });
});

describe('blockInstanceClassName', () => {
  it('builds a class from a real block id', () => {
    expect(blockInstanceClassName('9f3a1c72-0000-4000-8000-000000000001')).toBe(
      'b-9f3a1c72-0000-4000-8000-000000000001',
    );
  });

  it.each(['a b', 'a{b', 'a"b', '', 'a'.repeat(65)])('refuses %s', (id) => {
    expect(blockInstanceClassName(id)).toBeNull();
  });
});

describe('per-breakpoint overrides', () => {
  // Deliberately invalid data is the subject of the last test here, so it
  // cannot be typed: the claim being checked is precisely what happens
  // when a value the type forbids reaches the emitter anyway — from an
  // older row, a hand-edited record, or an attack.
  const instance = (styleOverride: unknown): Block[][] => [
    [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        type: 'Hero',
        props: {},
        styleOverride,
      } as Block,
    ],
  ];

  it('emits a container query, not a viewport media query', () => {
    const css = buildBlockStyleOverridesCss({
      Hero: {
        default: { base: { minHeight: '60vh' }, mobile: { minHeight: '30vh' } },
      },
    });
    expect(css).toContain(
      '.kometio-hero { --kometio-override-min-height: 60vh; }',
    );
    expect(css).toContain(
      '@container (max-width: 768px) { .kometio-hero { --kometio-override-min-height: 30vh; } }',
    );
    // The whole point of ADR-0047: a block in a narrow column on a wide
    // screen must get the narrow styles, which a viewport query cannot do.
    expect(css).not.toContain('@media');
  });

  it('reads an override written before breakpoints existed', () => {
    expect(
      buildBlockStyleOverridesCss({
        Hero: { default: { base: { minHeight: '60vh' } } },
      }),
    ).toContain('.kometio-hero { --kometio-override-min-height: 60vh; }');
  });

  it('emits nothing for a breakpoint that changes nothing', () => {
    const css = buildBlockStyleOverridesCss({
      Hero: { default: { base: { minHeight: '60vh' }, tablet: {} } },
    });
    expect(css).not.toContain('@container');
  });

  /**
   * The emitter runs while rendering a page, so a value it dislikes must
   * cost that one declaration and nothing more. Parsing with Zod here
   * would throw and take the whole page down — the reason
   * `responsiveBuckets` exists alongside `responsiveBlockStyleSchema`.
   */
  it('drops a hostile value at one breakpoint and keeps the rest', () => {
    const css = buildBlockInstanceRulesCss(
      instance({
        base: { minHeight: '60vh' },
        mobile: { minHeight: 'red; } body { display: none } .x {' },
      }),
    );
    expect(css).toContain('--kometio-override-min-height: 60vh;');
    expect(css).not.toContain('display: none');
    expect(css).not.toContain('@container');
  });

  it.each([null, 'a string', 42, [], { base: 'not an object' }])(
    'renders rather than throws on %s',
    (garbage) => {
      expect(() => buildBlockInstanceRulesCss(instance(garbage))).not.toThrow();
    },
  );
});

describe('blockVariantClassName', () => {
  it('builds the modifier class for a declared variant', () => {
    expect(blockVariantClassName('Button', 'secondary')).toBe(
      'kometio-button--secondary',
    );
    expect(blockVariantClassName('PromoBar', 'ghost-inverted')).toBe(
      'kometio-promo-bar--ghost-inverted',
    );
  });

  it('has no class for a block that uses the type default', () => {
    expect(blockVariantClassName('Button', undefined)).toBeNull();
    expect(blockVariantClassName('Button', DEFAULT_VARIANT)).toBeNull();
  });

  /**
   * The variant name becomes part of a selector, so it is checked where it
   * gets there — the lesson of PR #144, where a value AND a key both
   * reached a public stylesheet. It stops being theoretical the moment a
   * theme can add a variant and the name stops being a literal.
   */
  it.each([
    'secondary; } body { display: none } .x {',
    'Secondary',
    '--evil',
    'sec ondary',
    '',
    'a'.repeat(65),
  ])('refuses %s rather than putting it in a selector', (hostile) => {
    expect(blockVariantClassName('Button', hostile)).toBeNull();
  });

  // A block naming a variant this theme does not define is ADR-0048
  // working: the theme hid a design it does not have, and the block falls
  // back to its default look rather than failing.
  it('is a plain string for a variant no theme happens to define', () => {
    expect(blockVariantClassName('Button', 'brutalist')).toBe(
      'kometio-button--brutalist',
    );
  });

  it('refuses a block type that is not an identifier', () => {
    expect(
      blockVariantClassName('X { } body { display: none } .y', 'secondary'),
    ).toBeNull();
  });
});

describe('per-variant type styles', () => {
  /**
   * The point of ADR-0047's fourth decision, in one assertion: an agency
   * recolours the ghost buttons from the editor without touching the
   * primary ones, and without writing a line of CSS.
   */
  it('paints each variant of a type separately', () => {
    const css = buildBlockStyleOverridesCss({
      Button: {
        default: { base: { backgroundColor: '#0000ff' } },
        ghost: { base: { backgroundColor: 'transparent' } },
      },
    });

    expect(css).toContain(
      '.kometio-button { --kometio-override-bg: #0000ff; }',
    );
    expect(css).toContain(
      '.kometio-button--ghost { --kometio-override-bg: transparent; }',
    );
  });

  it('carries the breakpoints of a variant too', () => {
    const css = buildBlockStyleOverridesCss({
      Button: {
        ghost: { base: { paddingX: '2rem' }, mobile: { paddingX: '1rem' } },
      },
    });

    expect(css).toContain(
      '@container (max-width: 768px) { .kometio-button--ghost { --kometio-override-padding-x: 1rem; } }',
    );
  });

  // Same barrier as everywhere else: the key reaches a selector.
  it('drops a variant whose name could not be a class', () => {
    const css = buildBlockStyleOverridesCss({
      Button: {
        'ghost; } body { display: none } .x {': {
          base: { backgroundColor: 'red' },
        },
      },
    });

    expect(css).toBe('');
  });

  it('emits nothing for a type whose variants are all empty', () => {
    expect(
      buildBlockStyleOverridesCss({ Button: { default: { base: {} } } }),
    ).toBe('');
  });
});

/**
 * A theme may add style properties of its own to a block (ADR-0047's
 * consequence on `stylableProperties`): without it core is the only
 * possible source of properties, which contradicts ADR-0037 and
 * ADR-0041 — a theme could restyle a block but never give the agency a
 * knob for something core did not think of.
 */
describe("a theme's own style properties", () => {
  it('derives the custom property name from the key', () => {
    expect(
      buildBlockStyleOverridesCss({
        Card: { default: { base: { letterSpacing: '0.02em' } } },
      }),
    ).toContain('--kometio-override-letter-spacing: 0.02em;');
  });

  it('emits them beside the core ones, not instead', () => {
    const css = buildBlockStyleOverridesCss({
      Card: {
        default: { base: { backgroundColor: '#fff', cardElevation: '4px' } },
      },
    });

    expect(css).toContain('--kometio-override-bg: #fff;');
    expect(css).toContain('--kometio-override-card-elevation: 4px;');
  });

  // The exit barrier, and it is not redundant with the schema's: an
  // override reaches the emitter from the database too, where a row may
  // predate the rule or have been edited by hand (PR #144).
  it.each([
    'letter spacing',
    'LetterSpacing',
    '--evil',
    'letter}spacing',
    'a'.repeat(65),
  ])('refuses %s as a property name rather than emitting it', (key) => {
    const css = buildBlockStyleOverridesCss({
      Card: { default: { base: { [key]: '1px' } } },
    });

    expect(css).toBe('');
  });

  /**
   * The one case the derivation must NOT catch. `marginTop` and
   * `marginBottom` are core keys deliberately absent from the custom
   * property map — they are applied per instance on a wrapper, never as a
   * per-type rule. Deriving a name for them would quietly resurrect them
   * as one.
   */
  it('still emits no rule for marginTop/marginBottom', () => {
    expect(
      buildBlockStyleOverridesCss({
        Button: { default: { base: { marginTop: '1rem' } } },
      }),
    ).toBe('');
  });
});

describe('the motion set on a root block (docs/adr/0060)', () => {
  const wrapperFor = (styleOverride: unknown) =>
    buildRootBlockSpacingCss([
      { id: 'abc', type: 'Hero', props: {}, styleOverride },
    ] as never);

  it('emits the keyframe name the stylesheet defines, not the stored word', () => {
    const css = wrapperFor({ base: { animation: 'slide-up' } });
    expect(css).toContain('--kometio-anim-name: kometio-slide-up;');
  });

  it('emits duration, delay and easing beside it', () => {
    const css = wrapperFor({
      base: {
        animation: 'fade',
        animationDuration: '800ms',
        animationDelay: '200ms',
        animationEasing: 'linear',
      },
    });
    expect(css).toContain('--kometio-anim-duration: 800ms;');
    expect(css).toContain('--kometio-anim-delay: 200ms;');
    expect(css).toContain('--kometio-anim-easing: linear;');
  });

  /*
   * `none` is what a block without the property already does, so storing
   * it as a declaration would be a rule that says nothing — and one that
   * could shadow a value set elsewhere.
   */
  it('writes nothing for "none"', () => {
    expect(wrapperFor({ base: { animation: 'none' } })).toBe('');
  });

  /*
   * The exit barrier again (PR #144): a name that has no `@keyframes`
   * would set `animation-name` to something undefined, and the block
   * would silently never animate. Refused where it is emitted, not only
   * where it was typed.
   */
  it('refuses an animation the stylesheet does not define', () => {
    expect(wrapperFor({ base: { animation: 'flip' } })).toBe('');
  });

  /*
   * Base only, deliberately: an entrance is not a layout, and the sizes
   * are about layout. See `animationRules`.
   */
  it('ignores a per-breakpoint animation rather than emitting a query', () => {
    const css = wrapperFor({
      base: {},
      mobile: { animation: 'zoom' },
    });
    expect(css).toBe('');
  });

  it('reads the hover effect as an attribute, refusing anything else', () => {
    expect(rootBlockHoverAttr({ base: { hoverEffect: 'lift' } })).toBe('lift');
    expect(
      rootBlockHoverAttr({ base: { hoverEffect: 'none' } }),
    ).toBeUndefined();
    expect(
      rootBlockHoverAttr({ base: { hoverEffect: 'explode' } }),
    ).toBeUndefined();
    expect(rootBlockHoverAttr(undefined)).toBeUndefined();
  });
});
