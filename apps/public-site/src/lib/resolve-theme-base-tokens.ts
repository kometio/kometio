import type { ThemeBaseTokens } from '@kometio/shared-types';
import coreCss from '../styles/global.css?raw';
import { parseRootCustomProperties } from './resolve-theme-block-style-defaults-helpers';
import { getThemeCssRaw, perTheme } from './theme-registry';

/** Core's own `:root` (global.css): what a page gets for what its theme leaves out. */
const coreVars = parseRootCustomProperties(coreCss);

/**
 * A value as the page ends up with it: the theme's, else core's, with a
 * `var(--x)` followed to what it names. `--link` is `var(--primary)`, and
 * the editor paints its swatch in its OWN document, where
 * `var(--primary)` is the editor's blue and not the site's green.
 */
function effectiveValue(
  themeVars: Map<string, string>,
  name: string,
  followed: ReadonlySet<string> = new Set(),
): string | undefined {
  const value = themeVars.get(name) ?? coreVars.get(name);
  const reference = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (reference === undefined || followed.has(reference)) return value;
  return (
    effectiveValue(themeVars, reference, new Set([...followed, name])) ?? value
  );
}

/**
 * The active theme's own base values for `--primary`/`--secondary`/
 * `--font-sans-value`/`--radius` — what GlobalStylesDialog (editor-app)
 * shows as the starting point before any Tier 1 site override exists, so
 * picking a theme and opening its style settings shows that theme's real
 * colors/font, not a generic hardcoded placeholder. Same
 * parseRootCustomProperties extraction as resolveThemeForegroundTokens,
 * memoized per theme (docs/adr/0042).
 */
export const resolveThemeBaseTokens = perTheme(
  (resolvedTheme): ThemeBaseTokens => {
    const themeVars = parseRootCustomProperties(getThemeCssRaw(resolvedTheme));
    const value = (name: string) => effectiveValue(themeVars, name);
    const tokens: ThemeBaseTokens = {
      primary: value('--primary') ?? '',
      secondary: value('--secondary') ?? '',
      fontSansValue: value('--font-sans-value') ?? '',
      radius: value('--radius') ?? '',
      // What the page really shows: a value the theme leaves to core is
      // core's (a theme states only what it changes). Absent only when
      // neither declares it; the editor then drops the swatch (ADR-0050).
      background: value('--background'),
      foreground: value('--foreground'),
      muted: value('--muted'),
      mutedForeground: value('--muted-foreground'),
      border: value('--border'),
      link: value('--link'),
    };
    return tokens;
  },
);
