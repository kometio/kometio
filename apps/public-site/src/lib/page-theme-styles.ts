import {
  buildBlockStyleOverridesCss,
  DEFAULT_THEME_TOKENS,
  safeCssDeclarationValue,
  type ThemeSettings,
  type ThemeTokens,
} from '@kometio/shared-types';
import { resolveThemeFont, type ResolvedThemeFont } from './theme-font';

export interface PageThemeStylesInput {
  /** `site.themeSettings`: the site's own Tier 1 settings. */
  themeSettings: ThemeSettings;
  /** `site.themeTokens`: the per-type block styles. */
  themeTokens: ThemeTokens;
  /** `themeManifest.allowStyleOverrides` of the active theme (theme.json). */
  allowStyleOverrides: boolean | undefined;
  /** The active theme's own `:root` custom properties (Tier 2). */
  themeBaseTokens: ReadonlyMap<string, string>;
  /** The per-instance rules of the page being rendered, already built. */
  instanceStyleCss: string;
}

/** The Tier 1 settings that apply to THIS render, once the gates have been applied. */
export type EffectiveThemeSettings = Pick<
  ThemeSettings,
  | 'primaryColor'
  | 'secondaryColor'
  | 'fontFamily'
  | 'customCss'
  | 'contentWidth'
  | 'faviconUrl'
  | 'overridesEnabled'
>;

export interface PageThemeStyles {
  theme: EffectiveThemeSettings;
  themeFont: ResolvedThemeFont | null;
  /** The active theme's own tokens, as `name: value !important;` declarations. */
  themeBaseTokenDeclarations: string;
  /** The site's Tier 1 colours, font and content width, as declarations. */
  themeOverrideDeclarations: string;
  /** The per-type and per-instance block styles, layer order first; empty when there are none. */
  blockStyleCss: string;
  /**
   * Whether the page moves at all (docs/adr/0142): the owner's own switch,
   * and neither of the two gates above answers for it.
   */
  motionEnabled: boolean;
}

/**
 * What the page's `<head>` says about the theme's look, and which of the two
 * gates (the theme author's ceiling, the site's own switch) lets what
 * through.
 *
 * Moved out of PageLayout.astro as it was, comments included: it is pure, it
 * carries the decisions that are easiest to get wrong, and nothing tested it
 * while it was part of a template.
 */
export function resolvePageThemeStyles({
  themeSettings,
  themeTokens,
  allowStyleOverrides,
  themeBaseTokens,
  instanceStyleCss,
}: PageThemeStylesInput): PageThemeStyles {
  // Tier 1 of docs/adr/0021's theming model — layered on top of the active
  // filesystem theme (Tier 2, resolved above from site.themeName) via a
  // plain <style> block, but only when BOTH gates allow it:
  //   1. `themeManifest.allowStyleOverrides` (theme.json) — the theme
  //      author's own ceiling, defaults to true if the field is missing. A
  //      bespoke agency theme can set this to false so *no* site can ever
  //      override it, regardless of what's stored in the DB.
  //   2. `themeSettings.overridesEnabled` — the day-to-day switch
  //      *below* that ceiling, in the Style dialog itself, for "I want to
  //      temporarily go back to the theme's own look without losing what
  //      I've saved". A site can turn this off; it can never turn Tier 1
  //      back on if the theme's own ceiling already said no.
  // When either is false, no Tier 1 CSS is emitted at all, full stop.
  //
  // The two are kept apart below, because they mean different things and
  // they had been fused into one `&&` used for everything. The switch is
  // the SITE saying "show me the theme's own colours again"; the ceiling is
  // the THEME saying "nobody dresses me". Only the first is Tier 1's.
  //
  // Every declaration below is !important, found necessary by testing this
  // live rather than assumed: Astro's dev server injects `import '*.css'`
  // side-effect styles (global.css) as their own <style data-vite-dev-id>
  // tag positioned *after* this layout's own inline markup in the
  // rendered HTML, regardless of where that import appears in the
  // frontmatter above — so a same-specificity `:root { --font-sans-value:
  // ... }` here would silently lose to global.css's bare fallback despite
  // looking earlier in the source. !important is the explicit, order-
  // independent way to say "this wins over global.css's fallback", which is
  // the whole point of this block when active, not a specificity
  // workaround. The same reasoning is why Tier 2's own base tokens
  // (themeBaseTokenDeclarations below) get the identical !important
  // treatment now that they're emitted as an inline <style> instead of a
  // second static CSS import (docs/adr/0042 — a per-request `site.themeName`
  // can't be a static `import` target, Vite only resolves those once at
  // build time).
  // `theme` below is the *effective* Tier 1 settings for this render: every
  // field forced to its "not set" value when either gate disallows
  // overrides, rather than checking both gates at each usage site further
  // down — one check here is much harder to accidentally miss than four
  // scattered conditionals in the markup.
  /**
   * The theme author's ceiling. Everything a site puts on top of the theme
   * answers to it — Tier 1 tokens, per-type block styles, per-instance
   * ones — because "no site can ever override it" is what it says it
   * means, and a rule honoured by two tiers out of three is not a ceiling.
   */
  const themeAllowsOverrides = allowStyleOverrides ?? true;
  /**
   * The site's own switch, and it covers TIER 1 ONLY.
   *
   * It used to gate the per-type block styles too, from the commit that
   * added the global styles editor: both come out of a "styles" dialog, so
   * one gate looked right. The control says otherwise, and always has. It
   * lives in the Style settings page, it greys out exactly the five fields
   * beside it — primary colour, secondary colour, font, custom CSS,
   * favicon — and its own description reads "every field BELOW is ignored".
   * Block styles are not below it; they are not even in that page.
   *
   * The result was upside down: on a site with the switch off, an agency
   * could restyle ONE block on ONE page (that tier was never gated) but not
   * every block of a type. The smaller power allowed, the larger one
   * refused, with nothing saying so.
   */
  const allowThemeTokenOverrides =
    themeAllowsOverrides && themeSettings.overridesEnabled;
  const theme = allowThemeTokenOverrides
    ? themeSettings
    : {
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        customCss: null,
        contentWidth: null,
        faviconUrl: null,
        overridesEnabled: false,
      };
  const themeFont = resolveThemeFont(theme.fontFamily);
  // The per-type block styles (docs/adr/0022, per variant since ADR-0047).
  // The theme's ceiling, not the site's Tier 1 switch — see the two
  // constants above for why they are no longer the same thing.
  const tokens = themeAllowsOverrides ? themeTokens : DEFAULT_THEME_TOKENS;
  const themeOverrideDeclarations = [
    theme.primaryColor && `--primary: ${theme.primaryColor} !important;`,
    theme.secondaryColor && `--secondary: ${theme.secondaryColor} !important;`,
    themeFont && `--font-sans-value: ${themeFont.cssFontFamily} !important;`,
    // ADR-0049. It lands in the same `:root` as the colours above and after
    // the theme's own token block, so the site's number wins the identical
    // `!important` the theme's declaration carries — the ordering the two
    // <style> tags below already relied on for `--primary`.
    //
    // The value is a guarded CSS length at the schema (`cssLengthTokenSchema`),
    // and this is the second barrier PR #144 established for exactly this
    // position: a declaration written into a page-wide stylesheet is where a
    // string stops being data. `safeCssLength` drops anything that could
    // close the declaration rather than escaping it — a site rendering at
    // its theme's own width is a better outcome than one rendering an
    // attacker's rule.
    safeCssDeclarationValue(theme.contentWidth) &&
      `--kometio-content-width: ${theme.contentWidth} !important;`,
  ]
    .filter(Boolean)
    .join(' ');
  // The active theme's own :root tokens (Tier 2) — see the comment above
  // `allowThemeTokenOverrides` for why this needs !important now instead of
  // relying on source order like a static CSS import could.
  const themeBaseTokenDeclarations = [...themeBaseTokens.entries()]
    .map(([name, value]) => `${name}: ${value} !important;`)
    .join(' ');
  // The "component-level" override (docs/adr/0022) — one rule per styled
  // (block type, variant), not a single `:root` as above: each is scoped by
  // the block's own `.kometio-*` class, so only blocks of that type — and,
  // since ADR-0047, only those wearing that variant — see the new value.
  //
  // NOT `[data-kometio-block-type]`, which an earlier version of this comment
  // claimed: that attribute is on the editor-only wrapper, present when
  // `editable` is true, so a rule scoped there would never reach a real
  // visitor.
  const blockStyleOverridesCss = buildBlockStyleOverridesCss(
    tokens.blockStyles,
  );
  // The two tiers are declared before either is used, so their order is a
  // line someone can read rather than a property of where the rules happen
  // to appear in the document (ADR-0047).
  //
  // Neither is gated on the site's Tier 1 switch (docs/adr/0021), which is
  // about whether a SITE may repaint the THEME: its `:root` tokens, fonts,
  // custom CSS. These two are docs/adr/0022 — an editor styling one block,
  // or one block type — and the control that switch belongs to says as much.
  //
  // Both DO answer to the theme's own ceiling, which is a different claim:
  // a theme that declares `allowStyleOverrides: false` is refusing to be
  // dressed at all, and honouring that on two tiers out of three would make
  // it not a ceiling. No bundled theme sets it today, so this changes
  // nothing now; it makes the rule true for the first theme that does.
  const styleTiers = themeAllowsOverrides
    ? [blockStyleOverridesCss, instanceStyleCss].filter(Boolean)
    : [];
  // The declaration comes first so the order is a line someone can read
  // rather than a property of where the rules happen to land in the
  // document (ADR-0047) — and only when there is something to order, so a
  // page that customises nothing carries no extra bytes.
  const blockStyleCss =
    styleTiers.length > 0
      ? ['@layer kometio.class, kometio.instance;', ...styleTiers].join('\n')
      : '';

  return {
    theme,
    themeFont,
    themeBaseTokenDeclarations,
    themeOverrideDeclarations,
    blockStyleCss,
    // Read from the site's settings as they are, not from `theme` above: that
    // is "what of the site's look reaches the page", and a site that turned
    // motion off has not asked to see the theme's own look, it has asked for
    // stillness. A theme's ceiling on colours is no reason to keep moving.
    motionEnabled: themeSettings.motionEnabled,
  };
}
