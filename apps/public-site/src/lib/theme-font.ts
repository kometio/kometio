import {
  curatedThemeFontLabel,
  isCuratedThemeFont,
} from '@kometio/shared-types';

export interface ResolvedThemeFont {
  /** The CSS font-family value, ready to assign to --font-sans-value. */
  cssFontFamily: string;
}

const SYSTEM_FONT_STACK = 'ui-sans-serif, system-ui, sans-serif';

/**
 * The font a site chose in Style (docs/adr/0021, docs/adr/0146) as the
 * value of `--font-sans-value`, or `null` to leave the theme's own.
 *
 * Nothing to load here: each curated font is a file of the site, declared by
 * its `src/fonts/<font>/fonts.css` and bundled with the themes' fonts
 * (theme-fonts.ts), and an `@font-face` that no rule uses downloads nothing.
 *
 * `system` is the visitor's own interface font. A value that is not one of
 * the curated fonts gives `null` too: the field used to take any Google Fonts
 * name, and a site that typed one goes back to its theme's font.
 */
export function resolveThemeFont(
  fontFamily: string | null,
): ResolvedThemeFont | null {
  if (!fontFamily || !isCuratedThemeFont(fontFamily)) return null;
  if (fontFamily === 'system') return { cssFontFamily: SYSTEM_FONT_STACK };
  return {
    cssFontFamily: `'${curatedThemeFontLabel(fontFamily)}', ${SYSTEM_FONT_STACK}`,
  };
}
