import { groupByTheme, resolveBundledThemeName } from './theme-registry';

/**
 * The regions a theme may supply — `themes/<name>/regions/Header.astro`,
 * `ContentShell.astro`, `Footer.astro` — resolved once per process for
 * every bundled theme and looked up by `(theme, region)` on each render.
 *
 * This replaces the full `PageLayout.astro` override
 * (resolve-theme-layout-override.ts, removed once the migration landed):
 * that mechanism forced a theme to copy 581 lines of shell in order to
 * change one of them, and the copy then drifted in silence — a lost
 * accessibility link, lost editor attributes, CSS bleeding onto the other
 * themes. Here a theme cannot touch any of that: it receives the
 * already-rendered blocks as a slot.
 *
 * A theme that supplies no region gets core's own, exactly as it has
 * always been: a glob matching nothing is an empty map, not an error.
 */
const themeRegionModules = import.meta.glob<{ default: unknown }>(
  '../../../../themes/*/regions/*.astro',
  { eager: true },
);

export type ThemeRegionName = 'Header' | 'ContentShell' | 'Footer';

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.astro$/, '');
}

const regionsByTheme = groupByTheme(
  themeRegionModules,
  basename,
  (mod) => mod.default,
);

/**
 * The theme's component for this region, or `null` when the theme supplies
 * none — in which case the caller falls back to its own default wrapper.
 * The theme name goes through `resolveBundledThemeName`, so a stale
 * `Site.themeName` lands on the fallback theme instead of looking for
 * regions that do not exist.
 */
export function resolveThemeRegion<T>(
  region: ThemeRegionName,
  themeName: string,
): T | null {
  const override = regionsByTheme
    .get(resolveBundledThemeName(themeName))
    ?.get(region);
  return (override as T | undefined) ?? null;
}
