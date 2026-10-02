/**
 * docs/adr/0042 — which themes this deployment will actually serve.
 * Every theme on disk under `themes/` is bundled into the build (the
 * glob pattern must be a static literal, a Vite requirement, so it can
 * never be narrowed by config); `KOMETIO_THEME`, when set, is an optional
 * comma-separated allow-list applied here at runtime on top of that —
 * the mechanism an agency reaches for to ship an image whose client can
 * only ever pick the agency's own theme. Unset (the default): every
 * bundled theme is selectable. Changing it needs a restart, not a
 * rebuild.
 *
 * Every other theme-resolving file in this app (`resolve-theme-*.ts`,
 * `BlockRenderer.astro`, `PageLayout.astro`) builds on the primitives
 * here instead of re-deriving "which themes exist" or "what does an
 * unknown theme name fall back to" on its own.
 *
 * The allow-list itself lives in `@kometio/shared-types` since ADR-0069:
 * apps/api has to apply the identical rule to the editor's theme
 * picker, and when only this side applied it the picker offered themes
 * that then rendered as the fallback.
 */
import { applyThemeAllowList } from '@kometio/shared-types';

export { applyThemeAllowList };

export interface ThemeManifest {
  allowStyleOverrides?: boolean;
  /**
   * Keeps the footer at the bottom of the viewport even on short pages. It
   * lives here rather than in the theme's CSS because it targets `<body>`,
   * which is core's: docs-showcase used to achieve it with a
   * `<style is:global>`, and those rules landed on *every other* theme's
   * pages. As a flag, core applies it with its own scoped style and nothing
   * leaks.
   */
  stickyFooter?: boolean;
}

const themeManifestModules = import.meta.glob<{ default: ThemeManifest }>(
  '../../../../themes/*/theme.json',
  { eager: true },
);
const themeCssModules = import.meta.glob<string>(
  '../../../../themes/*/theme.css',
  { eager: true, query: '?raw', import: 'default' },
);

/** The theme name — the path segment right after `themes/` — out of an eager-glob key produced by a `themes/<name>/...` pattern, at any nesting depth under a theme's own directory. */
export function themeNameFromGlobPath(path: string): string | null {
  return path.match(/\/themes\/([^/]+)\//)?.[1] ?? null;
}

const themeNamesOnDisk = Object.keys(themeManifestModules)
  .map(themeNameFromGlobPath)
  .filter((name): name is string => name !== null)
  .sort();

if (themeNamesOnDisk.length === 0) {
  throw new Error(
    'No theme bundled in this apps/public-site build — every deployment ' +
      'needs at least one themes/<name>/theme.json on disk when astro build runs.',
  );
}

export const BUNDLED_THEME_NAMES: readonly string[] = applyThemeAllowList(
  themeNamesOnDisk,
  process.env['KOMETIO_THEME'],
);

const FALLBACK_THEME_NAME = 'classic';

/**
 * A site's own `Site.themeName` might name a theme this particular image
 * never bundled (KOMETIO_THEME excluded it at build, or the DB row is
 * stale) — every resolver in this app falls back through here instead of
 * rendering blank/broken for one misconfigured site. Prefers 'classic'
 * when it's bundled (the same default `Site.themeName`'s own DB column
 * has), else the first bundled theme alphabetically.
 */
export function resolveBundledThemeName(requested: string): string {
  if (BUNDLED_THEME_NAMES.includes(requested)) {
    return requested;
  }
  return BUNDLED_THEME_NAMES.includes(FALLBACK_THEME_NAME)
    ? FALLBACK_THEME_NAME
    : (BUNDLED_THEME_NAMES[0] ?? FALLBACK_THEME_NAME);
}

/**
 * `compute` for a theme, worked out once and kept: a bundled theme's files
 * are in the image and never change while it runs (docs/adr/0042). The
 * requested name is resolved first, so a theme that is not bundled shares
 * the fallback's value rather than computing its own.
 */
export function perTheme<T>(
  compute: (theme: string) => T,
): (themeName: string) => T {
  const byTheme = new Map<string, T>();
  return (themeName) => {
    const theme = resolveBundledThemeName(themeName);
    const known = byTheme.get(theme);
    if (known !== undefined) return known;
    const value = compute(theme);
    byTheme.set(theme, value);
    return value;
  };
}

const manifestByTheme = new Map<string, ThemeManifest>(
  Object.entries(themeManifestModules)
    .map(([path, mod]) => [themeNameFromGlobPath(path), mod.default] as const)
    .filter((entry): entry is [string, ThemeManifest] => entry[0] !== null),
);

/** The theme's own `theme.json` — see PageLayout.astro's own comment for `allowStyleOverrides`. */
export function getThemeManifest(themeName: string): ThemeManifest {
  return manifestByTheme.get(resolveBundledThemeName(themeName)) ?? {};
}

const cssByTheme = new Map<string, string>(
  Object.entries(themeCssModules)
    .map(([path, css]) => [themeNameFromGlobPath(path), css] as const)
    .filter((entry): entry is [string, string] => entry[0] !== null),
);

/**
 * The theme's raw `theme.css` text — injected by PageLayout.astro as an
 * inline `<style>` (not a static side-effect `import`, which Vite would
 * bundle unconditionally for every theme regardless of which one a given
 * request actually wants) and parsed for `:root` custom properties by
 * `resolve-theme-base-tokens.ts`/`resolve-theme-foreground-tokens.ts`/
 * `resolve-theme-block-style-defaults.ts`.
 */
export function getThemeCssRaw(themeName: string): string {
  return cssByTheme.get(resolveBundledThemeName(themeName)) ?? '';
}

/**
 * Splits an eager `themes/<name>/<rest>` glob result into one flat
 * sub-record per theme, each still keyed by its own full glob path — for
 * a caller (resolve-theme-page-blocks.ts) that hands the whole record to
 * a theme-agnostic helper (`collectThemeBlockCandidates`, `@kometio/block-
 * sdk`) expecting exactly the shape a single-theme `~theme/...` glob used
 * to produce.
 */
export function partitionByTheme<TModule>(
  modules: Record<string, TModule>,
): Map<string, Record<string, TModule>> {
  const result = new Map<string, Record<string, TModule>>();
  for (const [path, mod] of Object.entries(modules)) {
    const themeName = themeNameFromGlobPath(path);
    if (!themeName) {
      continue;
    }
    const themeModules = result.get(themeName) ?? {};
    themeModules[path] = mod;
    result.set(themeName, themeModules);
  }
  return result;
}

/**
 * Groups an eager `themes/<name>/<rest>` glob result into a per-theme map
 * keyed by the given glob path's basename, for resolvers that need "does
 * theme X have an override named Y" lookups (block overrides, icons —
 * anything with more than one file per theme). Not used for theme.json/
 * theme.css above, which are a single value per theme with nothing to
 * key by.
 */
export function groupByTheme<TModule, TValue>(
  modules: Record<string, TModule>,
  keyFn: (path: string) => string,
  valueFn: (mod: TModule) => TValue,
): Map<string, Map<string, TValue>> {
  const result = new Map<string, Map<string, TValue>>();
  for (const [path, mod] of Object.entries(modules)) {
    const themeName = themeNameFromGlobPath(path);
    if (!themeName) {
      continue;
    }
    if (!result.has(themeName)) {
      result.set(themeName, new Map());
    }
    result.get(themeName)?.set(keyFn(path), valueFn(mod));
  }
  return result;
}
