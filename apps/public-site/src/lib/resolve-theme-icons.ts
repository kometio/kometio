import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BRAND_ICON_PREFIX,
  mediaIconSvg,
  parseMediaIcon,
  type IconEntry,
} from '@kometio/shared-types';
import { siteIconImageUrl } from './media-icon-url';
import { groupByTheme, resolveBundledThemeName } from './theme-registry';

// The same pattern as resolve-theme-block-override.ts and the former
// resolve-theme-layout-override.ts (docs/adr/0021/0042):
// `themes/<name>/icons/*.svg` resolved once per process for every bundled
// theme — a theme that declares no `icons` in theme.json simply has no
// entry in its own map, with no error.
const themeIconModules = import.meta.glob<string>(
  '../../../../themes/*/icons/*.svg',
  {
    eager: true,
    query: '?raw',
    import: 'default',
  },
);

function iconNameFromPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, '');
}

const themeIconsByTheme = groupByTheme(
  themeIconModules,
  iconNameFromPath,
  (svg) => svg,
);

// The curated default set (docs/adr/0023): the whole current Lucide set,
// the same family editor-app already uses through lucide-react (see
// apps/editor-app/package.json) — not a hand-vendored subset, so it stays
// aligned with every version bump without a separate download/sync step.
// `lucide-static` is the only package in the Lucide family that publishes
// raw SVGs rather than React/Vue components — the only usable form here
// (apps/public-site has no server-side React runtime for core blocks,
// docs/adr/0019). Resolved through Node (`import.meta.resolve`), not
// `import.meta.glob`: a pattern pointing inside node_modules is not a
// relative path Vite's glob handles in this project, whereas Node's module
// resolution finds the package wherever pnpm actually symlinked it,
// regardless of the hoisting layout.
function loadDefaultIcons(): IconEntry[] {
  const packageJsonUrl = import.meta.resolve('lucide-static/package.json');
  const iconsDir = join(dirname(fileURLToPath(packageJsonUrl)), 'icons');
  return readdirSync(iconsDir)
    .filter((file) => file.endsWith('.svg'))
    .sort()
    .map((file) => ({
      name: file.replace(/\.svg$/, ''),
      svg: readFileSync(join(iconsDir, file), 'utf-8'),
    }));
}

/**
 * The brand marks (ADR-0053), under a `brand:` prefix.
 *
 * A second set, and a second package, because Lucide removed brand logos
 * from its own — 2034 icons and not one of Facebook, Instagram, YouTube
 * or WhatsApp. Without these a "social links" block can only render the
 * name of the network as text, which is not what anyone means by one.
 *
 * The prefix is not decoration: the two sets collide on 34 names (apple,
 * box, circle, bitcoin…), and an icon's name is stored in page content,
 * so `apple` has to keep meaning the same picture forever. `:` is safe as
 * the separator because no name in either set contains one.
 *
 * **Licensing.** simple-icons is CC0, but the marks themselves belong to
 * their owners and some carry their own licence — the package ships a
 * DISCLAIMER.md saying exactly that. Putting a company's logo on a link
 * to that company's page is the ordinary, intended use; anything else is
 * the site owner's call, not ours. Notably absent: LinkedIn, removed at
 * the trademark owner's request.
 */
function loadBrandIcons(): IconEntry[] {
  // Resolved through the package's own entry point rather than its
  // `package.json` — unlike lucide-static, simple-icons declares an
  // `exports` map that does not list `./package.json`, so asking for it
  // throws ERR_PACKAGE_PATH_NOT_EXPORTED at runtime while typechecking
  // perfectly happily. The entry point sits at the package root, so its
  // directory is the same one either way.
  const entryUrl = import.meta.resolve('simple-icons');
  const iconsDir = join(dirname(fileURLToPath(entryUrl)), 'icons');
  return readdirSync(iconsDir)
    .filter((file) => file.endsWith('.svg'))
    .sort()
    .map((file) => ({
      name: `${BRAND_ICON_PREFIX}${file.replace(/\.svg$/, '')}`,
      // These are solid shapes drawn with `fill`, where Lucide's are
      // outlines drawn with `stroke` — and a simple-icons SVG names no
      // fill at all, so it renders black whatever colour the block asks
      // for. Declaring `currentColor` here is what makes the same
      // `textColor` override work on both sets.
      svg: readFileSync(join(iconsDir, file), 'utf-8').replace(
        '<svg',
        '<svg fill="currentColor"',
      ),
    }));
}

let defaultIcons: IconEntry[] | null = null;
let brandIcons: IconEntry[] | null = null;

function getDefaultIcons(): IconEntry[] {
  if (!defaultIcons) defaultIcons = loadDefaultIcons();
  return defaultIcons;
}

function getBrandIcons(): IconEntry[] {
  if (!brandIcons) brandIcons = loadBrandIcons();
  return brandIcons;
}

/**
 * The active theme's whole icon set — a theme declaring even one icon WINS
 * outright over the default (no per-name fallback onto a partial set, see
 * docs/adr/0023's Consequences section): the "this theme does or does not
 * have its own set" choice is binary, not a merge.
 */
export function listThemeIcons(
  themeName: string,
  set: IconSet = 'interface',
): IconEntry[] {
  // The brands are never a theme's to replace, unlike the interface set
  // (ADR-0053): a theme redrawing arrows and chevrons has not redrawn the
  // Instagram logo, and would not want to.
  if (set === 'brand') {
    return getBrandIcons();
  }
  const themeIcons = themeIconsByTheme.get(resolveBundledThemeName(themeName));
  if (!themeIcons || themeIcons.size === 0) {
    return getDefaultIcons();
  }
  return [...themeIcons.entries()]
    .map(([name, svg]) => ({ name, svg }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which set to list. They are fetched separately, and that is a size
 * decision made with the numbers in hand: the interface set serialises to
 * 1.1MB and the brands to another 5.2MB, uncompressed, and a picker that
 * loaded both would make everyone pay for the logos whether or not they
 * ever open the brand tab.
 */
export type IconSet = 'interface' | 'brand';

const iconsByNamePerTheme = new Map<string, Map<string, string>>();

/** The per-name resolution block rendering uses (NavLink.astro, for instance) — it builds the map once per theme. */
export function resolveIconSvg(
  name: string | null | undefined,
  themeName: string,
): string | null {
  if (!name) return null;
  // An image from the media library, not an icon of the theme's sets:
  // wrapped so it draws wherever an icon's markup is drawn.
  const mediaIcon = parseMediaIcon(name);
  if (mediaIcon) return mediaIconSvg(siteIconImageUrl(mediaIcon.url));
  const resolvedTheme = resolveBundledThemeName(themeName);
  let iconsByName = iconsByNamePerTheme.get(resolvedTheme);
  if (!iconsByName) {
    // BOTH sets: rendering has to resolve whatever a page stored, and a
    // page can hold an interface icon and a brand mark side by side. Only
    // the PICKER fetches them separately, because only the picker pays
    // for the ones nobody asked for.
    iconsByName = new Map(
      [
        ...listThemeIcons(resolvedTheme, 'interface'),
        ...listThemeIcons(resolvedTheme, 'brand'),
      ].map((icon) => [icon.name, icon.svg]),
    );
    iconsByNamePerTheme.set(resolvedTheme, iconsByName);
  }
  return iconsByName.get(name) ?? null;
}
