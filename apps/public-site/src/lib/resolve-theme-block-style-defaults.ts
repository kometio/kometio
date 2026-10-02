import {
  BLOCK_STYLE_DEFAULTS,
  type BlockStyleDefaultsResponse,
} from '@kometio/shared-types';
import {
  parseRootCustomProperties,
  resolveBlockStyleDefaults,
} from './resolve-theme-block-style-defaults-helpers';
import { listThemePageBlocks } from './resolve-theme-page-blocks';
import { getThemeCssRaw, perTheme } from './theme-registry';

/**
 * One entry per block type declared in `BLOCK_STYLE_DEFAULTS`
 * (shared-types — docs/adr/0022). `BLOCK_STYLE_DEFAULTS` in shared-types is
 * the source of truth `BlockDescriptor.defaultStyle` reads too, so the
 * registry is not needed to answer this. Computed once per theme (docs/adr/0042 — every bundled
 * theme has its own tokens, memoized per theme once resolved).
 */
export const listBlockStyleDefaults = perTheme(
  (resolvedTheme): BlockStyleDefaultsResponse => {
    const themeVars = parseRootCustomProperties(getThemeCssRaw(resolvedTheme));
    const result: BlockStyleDefaultsResponse = {};
    for (const [type, declared] of Object.entries(BLOCK_STYLE_DEFAULTS)) {
      result[type] = resolveBlockStyleDefaults(declared, themeVars);
    }
    // Docs/adr/0041: a theme block's own `defaultStyle` (declared right in
    // its `.block.ts`, same shape as BLOCK_STYLE_DEFAULTS' own entries)
    // folds into this same response — `block-style-fields.tsx` already
    // looks up every block's resolved defaults generically by type string
    // against this one endpoint, core or theme-defined alike, so it needs
    // no changes of its own for a theme block's style popover to work.
    for (const entry of listThemePageBlocks([], resolvedTheme)) {
      if (entry.descriptor.defaultStyle) {
        result[entry.descriptor.type] = resolveBlockStyleDefaults(
          entry.descriptor.defaultStyle,
          themeVars,
        );
      }
    }
    return result;
  },
);
