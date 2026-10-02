import type { Block } from './content-model';
import {
  BREAKPOINT_MAX_WIDTHS,
  DEFAULT_VARIANT,
  type BlockStyleOverride,
  type ResponsiveBlockStyle,
  type StyleBreakpoint,
} from './site-theme-tokens';
import { eachBlock } from './block-tree';

/**
 * One custom-property name per field, shared by every block type
 * (docs/adr/0022) — not a `--button-radius` for Button and a
 * `--card-radius` for some other type: a block's `.astro` always reads
 * `var(--kometio-override-*, <the theme's default>)` whatever the type, so
 * the property name does not need to know the type — it is the CSS rule
 * that already scopes it per type (see `buildBlockStyleOverridesCss`
 * below). It lives in shared-types (not only in apps/public-site) because
 * editor-app uses it too, to update the `<style>` inside the canvas iframe
 * live when the "Style" button saves — the same logic, not duplicated
 * across the two apps.
 *
 * `marginTop`/`marginBottom` are deliberately EXCLUDED from this map — they
 * never become a per-type scoped CSS custom property: see the comment on
 * them in `site-theme-tokens.ts` for why (a
 * `.kometio-<type> { margin-bottom: ... }` rule would also touch nested
 * instances, where the space between siblings is already handled by the
 * container). They stay a plain data field on `Block.styleOverride`, read
 * directly by `PublicPageContent.astro` for a top-level block.
 */
type CssOverridableProperty = Exclude<
  keyof BlockStyleOverride,
  'marginTop' | 'marginBottom'
>;

export const BLOCK_STYLE_CUSTOM_PROPERTIES: Record<
  CssOverridableProperty,
  string
> = {
  backgroundColor: '--kometio-override-bg',
  textColor: '--kometio-override-text',
  borderRadius: '--kometio-override-radius',
  paddingX: '--kometio-override-padding-x',
  paddingY: '--kometio-override-padding-y',
  borderWidth: '--kometio-override-border-width',
  borderStyle: '--kometio-override-border-style',
  borderColor: '--kometio-override-border-color',
  boxShadow: '--kometio-override-shadow',
  backgroundImage: '--kometio-override-bg-image',
  backgroundPosition: '--kometio-override-bg-position',
  backgroundSize: '--kometio-override-bg-size',
  backgroundRepeat: '--kometio-override-bg-repeat',
  overlayColor: '--kometio-override-overlay',
  minHeight: '--kometio-override-min-height',
  maxWidth: '--kometio-override-max-width',
  gap: '--kometio-override-gap',
  contentAlign: '--kometio-override-align',
  contentJustify: '--kometio-override-justify',
  flexDirection: '--kometio-override-direction',
};

/**
 * "Button" -> "kometio-button", "PromoBar" -> "kometio-promo-bar" — the class
 * convention every styled block already follows by hand (Container.astro's
 * `.kometio-container`, Column.astro's `.kometio-column`, …). It derives the
 * class from the TYPE rather than requiring every block to declare it
 * explicitly somewhere: one place to keep consistent with the convention
 * instead of two.
 */
export function blockTypeToClassName(blockType: string): string {
  return `kometio-${blockType.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/**
 * The class that carries ONE variant of a block type
 * (`.kometio-button--secondary`), or `null` for anything that is not a
 * variant name.
 *
 * `null` and not a thrown error, and not the bare type class either: a
 * block may name a variant its current theme does not define — that is
 * ADR-0048's rule working as intended, a theme hiding a design it does
 * not have — and the answer is that the block renders in its default look.
 * Refusing the name outright would take the page down; falling back to
 * the type class silently would be the same thing as no variant, which is
 * what the caller does with `null` anyway, but stated where it can be
 * read.
 *
 * The character rule is the exit barrier, the same one the block type key
 * gets: whatever reaches a selector is checked where it gets there, not
 * only where it was written (PR #144).
 */
export function blockVariantClassName(
  blockType: string,
  variant: string | undefined,
): string | null {
  if (!variant || variant === DEFAULT_VARIANT) {
    return null;
  }
  const className = safeBlockTypeClassName(blockType);
  return className && /^[a-z][a-z0-9-]{0,63}$/.test(variant)
    ? `${className}--${variant}`
    : null;
}

/**
 * The "component-level" override (docs/adr/0022) — one CSS rule per styled
 * block type, scoped by the block's own `.kometio-*` class and NOT by
 * `[data-kometio-block-type]`: that wrapper only exists when `editable` is
 * true (BlockRenderer.astro) — on the published site, for a real visitor,
 * it is absent, so a rule scoped there would never take effect outside the
 * editor, the exact opposite of this feature's purpose. The block's class,
 * by contrast, is on the real markup in BOTH contexts. No `!important`:
 * unlike Tier 1's colours and fonts (docs/adr/0021), there is no
 * higher-specificity rule to beat here — the block itself reads
 * `var(--kometio-override-x, <default>)`, so whatever the custom property
 * resolves to is already the winning value by construction.
 */
export function buildBlockStyleOverridesCss(
  blockStyles: Record<string, Record<string, ResponsiveBlockStyle>>,
): string {
  const rules = Object.entries(blockStyles).flatMap(
    ([blockType, byVariant]) => {
      const className = safeBlockTypeClassName(blockType);
      if (!className) {
        return [];
      }
      return Object.entries(byVariant ?? {}).flatMap(([variant, style]) => {
        // The type's own look is the bare class; a variant adds its
        // modifier, and goes through the same character rule as everything
        // else that reaches a selector.
        const target =
          variant === DEFAULT_VARIANT
            ? className
            : blockVariantClassName(blockType, variant);
        return target ? buildResponsiveRules(`.${target}`, style) : [];
      });
    },
  );
  // A named tier rather than source order — see buildBlockInstanceRulesCss.
  return rules.length > 0
    ? `@layer kometio.class {\n${rules.join('\n')}\n}`
    : '';
}

/**
 * The per-instance override (docs/adr/0022) — the same custom properties as
 * above, but as an inline `style` attribute on the block's REAL element
 * (the component itself, Button.astro for instance, receives
 * `styleOverride` as an extra prop alongside its own — not the
 * `data-kometio-block-*` wrapper, which for the same reason as
 * `buildBlockStyleOverridesCss` above does not exist on the published
 * site). An inline style always beats the per-type rule for that same
 * element — no `!important` here either, for the same reason.
 */
/**
 * The same characters `cssValueSchema` refuses, checked again at the point
 * the string actually becomes CSS.
 *
 * Two barriers rather than one because they fail differently. The schema
 * guards the entrance and keeps the database clean; this guards the exit,
 * and covers what the schema cannot see — rows written before the schema
 * was tightened, a future write path that forgets to use it, a theme
 * supplying its own defaults. A function whose job is to emit a stylesheet
 * should not depend on its caller having validated the input.
 *
 * A declaration that fails is dropped, not escaped: there is no correct
 * escaping for "this was supposed to be a colour", and a block rendering
 * with its default appearance is a better outcome than one rendering with
 * whatever the string was trying to do.
 */
const CSS_VALUE_BREAKOUT = /[;{}@<>\\]|\/\*|\*\//;

/**
 * Exported since ADR-0049: the site's own content width is interpolated
 * into a `:root` declaration by PageLayout.astro, which is the same
 * position — a string becoming a stylesheet — this already guards for
 * block overrides. Exported rather than re-implemented there, so there is
 * one definition of "safe at the exit" to keep correct, not two that can
 * drift apart while both look right.
 */
export function safeCssDeclarationValue(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !CSS_VALUE_BREAKOUT.test(value)
    ? value
    : null;
}

/** A block type only ever names a class here, so anything that is not an identifier cannot. */
function safeBlockTypeClassName(blockType: string): string | null {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(blockType)
    ? blockTypeToClassName(blockType)
    : null;
}

/**
 * Every rule one styled thing needs, at every size — the base declaration
 * plus one container query per narrower tier that changes something.
 *
 * **Container queries, not media queries.** Elementor and Webflow drive
 * responsive styling from the viewport and inherit its defect: a block
 * inside a narrow column, seen on a wide screen, gets the DESKTOP styles
 * because the window is wide, and breaks. A container query asks how much
 * room the block actually has. For a block at the top level of a page
 * that is the same question — its container is as wide as the viewport —
 * so nothing feels different until the case where the viewport was the
 * wrong thing to ask about.
 *
 * Narrower tiers come last, so mobile wins over tablet where both match.
 *
 * The dangerous part, and the reason for the invariant in
 * `container-type.spec.ts`: if no ancestor declares `container-type`,
 * `@container` simply never matches. No error, no warning, nothing in
 * devtools marking the rule inert.
 */
/**
 * The breakpoint buckets of a stored override, whatever shape it is in.
 *
 * Deliberately NOT `responsiveBlockStyleSchema.parse`, though the schema
 * describes the same shape: a parse THROWS on a value it dislikes, and
 * this runs while rendering a page. One bad string in one block's
 * override — left by an older version, a hand-edited row, an attempt at
 * injection — would take down the whole page instead of costing that one
 * declaration. The schema guards the boundary where rejecting the write
 * is the right answer; here the right answer is to emit everything that
 * is fine and drop what is not, which `safeCssDeclarationValue` already does
 * per declaration.
 */
function responsiveBuckets(
  style: unknown,
): Record<StyleBreakpoint, Record<string, unknown>> {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isRecord(style)) {
    return { base: {}, tablet: {}, mobile: {} };
  }
  // The old flat shape is the new one with only `base` — see the same
  // reasoning in `responsiveBlockStyleSchema`.
  if (!('base' in style)) {
    return { base: style, tablet: {}, mobile: {} };
  }
  const bucketOf = (breakpoint: StyleBreakpoint) => {
    const bucket = style[breakpoint];
    return isRecord(bucket) ? bucket : {};
  };
  return {
    base: bucketOf('base'),
    tablet: bucketOf('tablet'),
    mobile: bucketOf('mobile'),
  };
}

function buildResponsiveRules(selector: string, style: unknown): string[] {
  const { base, tablet, mobile } = responsiveBuckets(style);
  const perBreakpoint = { tablet, mobile };
  const rules: string[] = [];
  const baseDeclarations = buildOverrideDeclarations(base);
  if (baseDeclarations) {
    rules.push(`${selector} { ${baseDeclarations} }`);
  }
  for (const breakpoint of ['tablet', 'mobile'] as const) {
    const declarations = buildOverrideDeclarations(perBreakpoint[breakpoint]);
    if (declarations) {
      rules.push(
        `@container (max-width: ${BREAKPOINT_MAX_WIDTHS[breakpoint]}px) { ${selector} { ${declarations} } }`,
      );
    }
  }
  return rules;
}

/** The declaration list of one override — the single place the property map is walked, so the emitters below cannot drift apart. */
function buildOverrideDeclarations(
  override: Readonly<Record<string, unknown>>,
): string | null {
  const core = (
    Object.keys(BLOCK_STYLE_CUSTOM_PROPERTIES) as CssOverridableProperty[]
  ).map((field) => {
    const value = safeCssDeclarationValue(override[field]);
    return value ? `${BLOCK_STYLE_CUSTOM_PROPERTIES[field]}: ${value};` : null;
  });

  // Anything else in the override came from a THEME's own style property
  // (ADR-0047). Core's names are not mechanical — `backgroundColor` is
  // `--kometio-override-bg` — so they stay a map; a theme's is derived from
  // its key, which is why the theme never gets to name the variable and
  // cannot collide with core's or point two properties at one name.
  const themeProperties = Object.keys(override)
    .filter((key) => !(key in BLOCK_STYLE_CUSTOM_PROPERTIES))
    .map((key) => {
      const name = themeStylePropertyName(key);
      const value = safeCssDeclarationValue(override[key]);
      return name && value ? `${name}: ${value};` : null;
    });

  const declarations = [...core, ...themeProperties]
    .filter((declaration): declaration is string => declaration !== null)
    .join(' ');
  return declarations.length > 0 ? declarations : null;
}

/**
 * `letterSpacing` becomes `--kometio-override-letter-spacing`, or `null`
 * for anything that could not safely be a custom property name.
 *
 * The exit barrier for a theme's own style properties, and it is not
 * redundant with the schema's: an override reaches here from the database
 * too, where a row may predate the rule or have been edited by hand. The
 * lesson of PR #144 is that whatever reaches a stylesheet is checked
 * where it gets there, not only where it was written.
 *
 * `marginTop`/`marginBottom` are the one case this must NOT catch: they
 * are core keys deliberately absent from the map above (instance-only,
 * see site-theme-tokens.ts), so they are excluded here explicitly rather
 * than silently becoming `--kometio-override-margin-top` — which would
 * quietly resurrect them as a per-type rule.
 */
function themeStylePropertyName(key: string): string | null {
  if (
    !/^[a-z][A-Za-z0-9]{0,63}$/.test(key) ||
    INSTANCE_ONLY_PROPERTIES.has(key)
  ) {
    return null;
  }
  return `--kometio-override-${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/** Core properties that are deliberately not CSS custom properties at all — see BLOCK_STYLE_CUSTOM_PROPERTIES's own comment. */
const INSTANCE_ONLY_PROPERTIES = new Set([
  'marginTop',
  'marginBottom',
  // The animation set (docs/adr/0060) joins them for the same reason and
  // one more: the animated element is the WRAPPER around a root block, so
  // a per-type rule scoped by `.kometio-<type>` would land on the wrong
  // element entirely.
  'animation',
  'animationDuration',
  'animationDelay',
  'animationEasing',
  'hoverEffect',
]);

/**
 * The class that carries ONE block instance's overrides.
 *
 * Block ids are generated (`crypto.randomUUID`), so anything that is not
 * one is refused: this value becomes a CSS selector, and the lesson of
 * the block-type key is that whatever reaches a selector is checked where
 * it gets there, not only where it was written.
 */
export function blockInstanceClassName(blockId: string): string | null {
  return /^[A-Za-z0-9-]{1,64}$/.test(blockId) ? `b-${blockId}` : null;
}

/** Every block of a tree carrying an override, children included. */
function collectStyledBlocks(
  blocks: Block[],
): { id: string; override: ResponsiveBlockStyle }[] {
  const found: { id: string; override: ResponsiveBlockStyle }[] = [];
  for (const block of eachBlock(blocks)) {
    if (block.id && block.styleOverride) {
      found.push({ id: block.id, override: block.styleOverride });
    }
  }
  return found;
}

/**
 * The per-INSTANCE overrides of a page, as real CSS rules.
 *
 * They were an inline `style` attribute, and the cascade worked by
 * construction: inline beats the per-type rule, no `!important` needed.
 * Elegant, and a dead end — **an HTML `style` attribute cannot contain a
 * media query** (ADR-0047). That is not a limitation of this code, it is
 * the language, and per-breakpoint styling per instance is impossible
 * while the value stays inline.
 *
 * Two rules of equal specificity then decide by source order, which is
 * exactly the fragile detail someone eventually breaks. `@layer` makes a
 * later layer win regardless of specificity OR order, so the tier model
 * becomes one readable line instead of a convention resting on an
 * accident.
 *
 * Deliberately only these two layers. The theme's own `:root` tokens stay
 * unlayered: moving them would change how they interact with
 * `!important`, where layer order REVERSES — and they are not in conflict
 * with anything here anyway, because a declaration on an element always
 * beats an inherited one, whatever layer it came from.
 */
/**
 * The class carrying a ROOT block's own spacing (ADR-0050) — on the
 * wrapper, not on the block.
 *
 * A separate name from `blockInstanceClassName` because they land on two
 * different elements: the instance class styles the block itself, this one
 * styles the box the page puts around it. Sharing one class would apply
 * every rule to both.
 */
export function rootBlockInstanceClassName(blockId: string): string | null {
  return /^[A-Za-z0-9_-]{1,64}$/.test(blockId) ? `kometio-rb-${blockId}` : null;
}

/**
 * The space around each root block that somebody actually customized
 * (ADR-0050).
 *
 * These two properties used to be an inline `style` on the wrapper, and
 * `base`-only, because their DEFAULT depends on the block's position —
 * the last block gets no gap below it — which no rule emitter knew about.
 * The default now lives in CSS as `.kometio-root-block:last-child`, which
 * knows about position by construction, leaving these free to be ordinary
 * per-breakpoint rules: a margin can differ on a phone like every other
 * style property, and the editor no longer has to hide the field at
 * narrow sizes to avoid promising something that would not happen.
 *
 * They stay out of `BLOCK_STYLE_CUSTOM_PROPERTIES` (they are not custom
 * properties any block reads) and out of the per-TYPE tier: spacing
 * between sections is a property of one page's rhythm, not of a type.
 */
export function buildRootBlockSpacingCss(content: Block[]): string {
  const rules = content.flatMap((block) => {
    const className = block.id ? rootBlockInstanceClassName(block.id) : null;
    return className
      ? [
          ...spacingRules(`.${className}`, block.styleOverride),
          ...animationRules(`.${className}`, block.styleOverride),
        ]
      : [];
  });
  return rules.length > 0
    ? `@layer kometio.instance {\n${rules.join('\n')}\n}`
    : '';
}

/**
 * The margin rules for one root block, base plus one container query per
 * narrower tier that changes something — the same shape as
 * `buildResponsiveRules`, but emitting real `margin-top`/`margin-bottom`
 * declarations rather than custom properties.
 *
 * Not routed through that function: it walks
 * `BLOCK_STYLE_CUSTOM_PROPERTIES`, which deliberately excludes these two
 * keys (INSTANCE_ONLY_PROPERTIES) because no block reads them as
 * variables. Teaching it a second output mode would put a special case in
 * front of every other property; this is the smaller, more honest shape.
 */
/**
 * The animation and hover rules for one root block (docs/adr/0060).
 *
 * Base only, with no per-breakpoint tiers, and that is a decision rather
 * than an omission: an entrance animation is not a layout, and the sizes
 * are about layout. A different animation on a phone would be a second
 * thing to keep in step for no expressive gain — and the size at which
 * animation genuinely has to change is not the viewport, it is whether
 * the reader asked for less motion, which `prefers-reduced-motion`
 * answers on its own (global.css).
 *
 * Emitted as CUSTOM PROPERTIES, not as `animation:` declarations. The
 * shorthand lives once in global.css, where it can be paused until the
 * block scrolls into view and dropped entirely under
 * `prefers-reduced-motion`; scattering it per block would mean writing
 * both of those rules once per block instead.
 */
const ANIMATION_KEYFRAMES = new Set([
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
]);

/**
 * The hover effect one root block wears, or `null`.
 *
 * An ATTRIBUTE on the wrapper and not a custom property, unlike the
 * animation beside it: a hover effect is two declarations and a
 * transition, not one value, so there is nothing a custom property could
 * hold — and CSS cannot select on a custom property's value without
 * `@container style()`, which is not yet everywhere.
 */
export function rootBlockHoverAttr(style: unknown): string | undefined {
  const { base } = responsiveBuckets(style);
  const value = safeCssDeclarationValue(base['hoverEffect']);
  return value && value !== 'none' && HOVER_EFFECTS.has(value)
    ? value
    : undefined;
}

const HOVER_EFFECTS = new Set(['lift', 'grow', 'dim']);

function animationRules(selector: string, style: unknown): string[] {
  const { base } = responsiveBuckets(style);
  const name = safeCssDeclarationValue(base['animation']);
  const declarations = [
    // The stored value is the vocabulary's word (`slide-up`); the
    // stylesheet's keyframes are prefixed. Mapped here, once, so the
    // saved data stays readable and a keyframe set can be renamed without
    // rewriting every page that used it.
    name && name !== 'none' && ANIMATION_KEYFRAMES.has(name)
      ? `--kometio-anim-name: kometio-${name};`
      : null,
    ...(
      [
        ['animationDuration', '--kometio-anim-duration'],
        ['animationDelay', '--kometio-anim-delay'],
        ['animationEasing', '--kometio-anim-easing'],
      ] as const
    ).map(([key, property]) => {
      const value = safeCssDeclarationValue(base[key]);
      return value && value !== 'none' ? `${property}: ${value};` : null;
    }),
  ].filter((declaration): declaration is string => declaration !== null);

  return declarations.length > 0
    ? [`${selector} { ${declarations.join(' ')} }`]
    : [];
}

function spacingRules(selector: string, style: unknown): string[] {
  const { base, tablet, mobile } = responsiveBuckets(style);
  const declarationsFor = (bucket: Record<string, unknown>): string | null => {
    const top = safeCssDeclarationValue(bucket['marginTop']);
    const bottom = safeCssDeclarationValue(bucket['marginBottom']);
    const declarations = [
      top ? `margin-top: ${top};` : null,
      bottom ? `margin-bottom: ${bottom};` : null,
    ]
      .filter((declaration): declaration is string => declaration !== null)
      .join(' ');
    return declarations.length > 0 ? declarations : null;
  };

  const rules: string[] = [];
  const baseDeclarations = declarationsFor(base);
  if (baseDeclarations) {
    rules.push(`${selector} { ${baseDeclarations} }`);
  }
  // Narrower tiers last, so mobile wins over tablet where both match —
  // the same ordering rule as every other responsive rule we emit.
  for (const [breakpoint, bucket] of [
    ['tablet', tablet],
    ['mobile', mobile],
  ] as const) {
    const declarations = declarationsFor(bucket);
    if (declarations) {
      rules.push(
        `@container (max-width: ${BREAKPOINT_MAX_WIDTHS[breakpoint]}px) { ${selector} { ${declarations} } }`,
      );
    }
  }
  return rules;
}

export function buildBlockInstanceRulesCss(contents: Block[][]): string {
  const rules = contents
    .flatMap((content) => collectStyledBlocks(content))
    .flatMap(({ id, override }) => {
      const className = blockInstanceClassName(id);
      return className ? buildResponsiveRules(`.${className}`, override) : [];
    });
  return rules.length > 0
    ? `@layer kometio.instance {\n${rules.join('\n')}\n}`
    : '';
}
