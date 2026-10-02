import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { coreDispatchEntries, type BlockDispatchEntry } from './block-dispatch';
import { resolveThemeBlockOverride } from './resolve-theme-block-override';
import { themeBlockRegistry } from './resolve-theme-page-blocks';
import { perTheme } from './theme-registry';

/**
 * A core block's component is found by its name: `components/blocks/<Type>.astro`
 * is the design of the block whose descriptor says `type: '<Type>'`. There
 * is no list of them to keep beside the descriptors — a descriptor with no
 * file stops the site at startup (`coreDispatchEntries`), and a file with no
 * descriptor is caught by `block-components.spec.ts`. Anything that is not a
 * block lives in `components/parts/`.
 */
const componentModules = import.meta.glob<{ default: AstroComponentFactory }>(
  '../components/blocks/*.astro',
  { eager: true },
);

function typeOf(globPath: string): string {
  return globPath.slice(globPath.lastIndexOf('/') + 1).replace(/\.astro$/, '');
}

const componentByType = new Map(
  Object.entries(componentModules).map(([path, module]) => [
    typeOf(path),
    module.default,
  ]),
);

const CORE_ENTRIES = coreDispatchEntries(
  [
    ...new Map(
      [...pageBlocks, ...headerFooterBlocks].map((d) => [d.type, d]),
    ).values(),
  ],
  (type) => componentByType.get(type),
);
const CORE_BLOCK_TYPES = Object.keys(CORE_ENTRIES);

/**
 * The dispatch table for one theme (docs/adr/0042 — every bundled theme
 * ships in the same image, `themeName` picks which one a request sees):
 * each core block with the theme's own `blocks/<Type>.astro` in place of
 * its component when it ships one, plus the theme's genuinely new block
 * types (docs/adr/0041). Worked out once per theme, not once per block
 * rendered.
 */
export const blockDispatchFor = perTheme(
  (theme): Record<string, BlockDispatchEntry> => {
    const table: Record<string, BlockDispatchEntry> = {};
    for (const [type, entry] of Object.entries(CORE_ENTRIES)) {
      table[type] = {
        ...entry,
        component: resolveThemeBlockOverride(type, entry.component, theme),
      };
    }
    return Object.assign(table, themeBlockRegistry(CORE_BLOCK_TYPES, theme));
  },
);
