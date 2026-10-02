import { groupByTheme, resolveBundledThemeName } from './theme-registry';

// docs/adr/0021 + themes/README.md's "escalation on top of the token-only
// default": a theme package can ship its own `blocks/<Name>.astro` to
// replace a core block's markup entirely, resolved once per process for
// every bundled theme (docs/adr/0042 — every theme ships in the same
// image, `themeName` picks which one a given request sees). A theme with
// no blocks/ directory simply has no entries in its own map — no error,
// `coreComponent` wins every time.
const themeBlockOverrideModules = import.meta.glob<{ default: unknown }>(
  '../../../../themes/*/blocks/*.astro',
  { eager: true },
);

function basename(path: string): string {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return fileName.replace(/\.astro$/, '');
}

const overridesByTheme = groupByTheme(
  themeBlockOverrideModules,
  basename,
  (mod) => mod.default,
);

export function resolveThemeBlockOverride<T>(
  blockType: string,
  coreComponent: T,
  themeName: string,
): T {
  const override = overridesByTheme
    .get(resolveBundledThemeName(themeName))
    ?.get(blockType);
  return (override as T | undefined) ?? coreComponent;
}
