import type { ThemeForegroundTokens } from '@kometio/shared-types';
import { parseRootCustomProperties } from './resolve-theme-block-style-defaults-helpers';
import { getThemeCssRaw, perTheme } from './theme-registry';

/**
 * `--primary-foreground`/`--secondary-foreground` resolved (not a raw
 * `var(--x)`) — it does not go through `listBlockStyleDefaults()` (which
 * resolves only the properties declared in `BLOCK_STYLE_DEFAULTS` per block
 * type): these two root tokens serve the editor's WCAG contrast check
 * (GlobalStylesDialog), independently of any block. It reuses
 * `parseRootCustomProperties`, the same `:root { ... }` extraction already
 * used there — when a token is missing from the active theme (theoretically
 * possible for an incomplete custom theme), the caller gets an empty string
 * and skips the check rather than throwing. Memoized per theme
 * (docs/adr/0042).
 */
export const resolveThemeForegroundTokens = perTheme(
  (resolvedTheme): ThemeForegroundTokens => {
    const themeVars = parseRootCustomProperties(getThemeCssRaw(resolvedTheme));
    const tokens: ThemeForegroundTokens = {
      primaryForeground: themeVars.get('--primary-foreground') ?? '',
      secondaryForeground: themeVars.get('--secondary-foreground') ?? '',
    };
    return tokens;
  },
);
