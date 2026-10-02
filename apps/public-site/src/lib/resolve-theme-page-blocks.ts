import {
  collectThemeBlockCandidates,
  validateThemeBlockSet,
  type BlockDescriptor,
  type ThemeBlockCandidate,
} from '@kometio/block-sdk';
import type { ThemeBlocksResponse } from '@kometio/shared-types';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import {
  buildDispatchEntry,
  buildThemeBlocksResponseEntry,
  checkCoreTypeCollisions,
  type ThemeBlockDispatchEntry,
} from './resolve-theme-page-blocks-helpers';
import { partitionByTheme, resolveBundledThemeName } from './theme-registry';

/**
 * Docs/adr/0041 + 0042 — a theme's own genuinely NEW block types (not just
 * an override of an existing one, see resolve-theme-block-override.ts for
 * that separate, unchanged mechanism). Same glob technique, three files
 * instead of one: `themes/<name>/blocks/<Type>.block.ts` (descriptor +
 * schema), `<Type>.astro` (render), `<Type>.locales.json` (i18n) — for
 * every bundled theme now, not just one. `import.meta.glob` against a
 * pattern that matches nothing (most themes add none of these) simply
 * returns `{}` — no error.
 *
 * Validation failures **throw**, deliberately, unlike the client-side
 * merge in apps/editor-app (which degrades a single bad entry instead) —
 * this runs at `astro build`/`astro dev` startup, with a developer right
 * there to see the message, the same posture every core block's
 * `defineBlock()` already has via its own `schema.parse()`.
 */
interface BlockModule {
  default: BlockDescriptor;
  schema?: { parse: (props: unknown) => Record<string, unknown> };
}

const blockModules = import.meta.glob<BlockModule>(
  '../../../../themes/*/blocks/*.block.ts',
  { eager: true },
);
const astroModules = import.meta.glob<{ default: AstroComponentFactory }>(
  '../../../../themes/*/blocks/*.astro',
  { eager: true },
);
const localesModules = import.meta.glob(
  '../../../../themes/*/blocks/*.locales.json',
  { eager: true, import: 'default' },
) as Record<string, ThemeBlockCandidate['locales']>;

const blockModulesByTheme = partitionByTheme(blockModules);
const astroModulesByTheme = partitionByTheme(astroModules);
const localesModulesByTheme = partitionByTheme(localesModules);

function basenameOf(globPath: string, suffix: string): string {
  const fileName = globPath.slice(globPath.lastIndexOf('/') + 1);
  return fileName.endsWith(suffix)
    ? fileName.slice(0, -suffix.length)
    : fileName;
}

function loadValidatedCandidates(
  themeName: string,
  coreBlockTypes: readonly string[],
): ThemeBlockCandidate[] {
  const candidates = collectThemeBlockCandidates(
    blockModulesByTheme.get(themeName) ?? {},
    astroModulesByTheme.get(themeName) ?? {},
    localesModulesByTheme.get(themeName) ?? {},
  );
  const errors = [
    ...checkCoreTypeCollisions(candidates, coreBlockTypes),
    ...validateThemeBlockSet(candidates),
  ];
  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.basename}: ${error.message}`)
      .join('\n');
    throw new Error(
      `Invalid theme block(s) under themes/${themeName}/blocks/:\n${details}`,
    );
  }
  return candidates;
}

const registryCacheByTheme = new Map<
  string,
  Record<string, ThemeBlockDispatchEntry>
>();

/**
 * The theme's own new block types, added to the dispatch table by
 * `blockDispatchFor` (block-dispatch-for-theme.ts). `coreBlockTypes` is
 * passed in by the caller rather than read from `@kometio/block-registry`
 * here, so this loader stays unaware of any specific core block type by
 * construction, not just by convention.
 */
export function themeBlockRegistry(
  coreBlockTypes: readonly string[],
  themeName: string,
): Record<string, ThemeBlockDispatchEntry> {
  const resolvedTheme = resolveBundledThemeName(themeName);
  const cached = registryCacheByTheme.get(resolvedTheme);
  if (cached) return cached;

  const candidates = loadValidatedCandidates(resolvedTheme, coreBlockTypes);
  const astroModulesForTheme = astroModulesByTheme.get(resolvedTheme) ?? {};
  const blockModulesForTheme = blockModulesByTheme.get(resolvedTheme) ?? {};
  const renderComponentsByBasename = new Map(
    Object.entries(astroModulesForTheme).map(([path, mod]) => [
      basenameOf(path, '.astro'),
      mod.default,
    ]),
  );
  const schemasByBasename = new Map(
    Object.entries(blockModulesForTheme).map(([path, mod]) => [
      basenameOf(path, '.block.ts'),
      mod.schema,
    ]),
  );

  const registry: Record<string, ThemeBlockDispatchEntry> = {};
  for (const candidate of candidates) {
    const component = renderComponentsByBasename.get(candidate.basename);
    const schema = schemasByBasename.get(candidate.basename);
    if (!component || !schema) continue; // unreachable once validation passed
    registry[candidate.descriptor.type] = buildDispatchEntry(
      candidate.descriptor,
      component,
      schema,
    );
  }
  registryCacheByTheme.set(resolvedTheme, registry);
  return registry;
}

const responseCacheByTheme = new Map<string, ThemeBlocksResponse>();

/** Backs `GET /api/themes/current/blocks`. */
export function listThemePageBlocks(
  coreBlockTypes: readonly string[],
  themeName: string,
): ThemeBlocksResponse {
  const resolvedTheme = resolveBundledThemeName(themeName);
  const cached = responseCacheByTheme.get(resolvedTheme);
  if (cached) return cached;

  const candidates = loadValidatedCandidates(resolvedTheme, coreBlockTypes);
  const response = candidates.map(buildThemeBlocksResponseEntry);
  responseCacheByTheme.set(resolvedTheme, response);
  return response;
}
