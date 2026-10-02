import { describe, expect, it } from 'vitest';
import {
  checkOverridesDrawVariants,
  collectThemeBlockCandidates,
  collectThemeVariantExtensions,
  findCoreBlockTypeCollisions,
  validateThemeBlockSet,
  CORE_BLOCK_VARIANTS,
  type BlockDescriptor,
  type ThemeBlockVariantModule,
} from '@kometio/block-sdk';
import type { ThemeBlockLocales } from '@kometio/shared-types';

/**
 * Docs/adr/0041 — every theme's own gate for the blocks it declares
 * under `blocks/`. Runs for real in CI (this theme is now a real Nx
 * project, see themes/README.md), not just for whichever theme happens
 * to be the active KOMETIO_THEME at build time.
 *
 * `classic` ships no extension blocks yet — this stays here, green and
 * trivial, so the very first block a dev adds here is checked the same
 * way from day one, instead of needing this file created at that point.
 */
describe('classic theme blocks', () => {
  it('has no validation errors', () => {
    const blockModules = import.meta.glob<{ default: BlockDescriptor }>(
      './*.block.ts',
      { eager: true },
    );
    // Non-eager: only the file paths (keys) are needed for the
    // existence check `collectThemeBlockCandidates` does — this vitest
    // project has no Astro Vite plugin (unlike apps/public-site, the
    // real consumer), so actually transforming `.astro` content here
    // would fail on syntax it can't parse.
    const astroModules = import.meta.glob('./*.astro');
    const localesModules = import.meta.glob<ThemeBlockLocales>(
      './*.locales.json',
      { eager: true, import: 'default' },
    );

    const candidates = collectThemeBlockCandidates(
      blockModules,
      astroModules,
      localesModules,
    );

    expect(validateThemeBlockSet(candidates)).toEqual([]);

    // Core-type collisions: a theme's own block must not reuse a name core
    // already ships. The list comes from block-sdk's CORE_BLOCK_TYPES
    // rather than from `@kometio/block-registry` — that package is React and
    // editor UI, and depending on it here is what used to make a theme
    // undevelopable outside this monorepo. block-registry's own
    // core-block-types.spec.ts keeps the constant honest.
    //
    // This is the one check in the whole mechanism that's only reliable
    // when run here: apps/public-site's runtime check
    // (resolve-theme-page-blocks.ts) depends on a real page having
    // rendered first — fine as defense in depth, but this CI check is what
    // guarantees "collision = build fails", unconditionally.
    expect(
      findCoreBlockTypeCollisions(
        candidates.map((candidate) => candidate.descriptor.type),
      ),
    ).toEqual([]);
  });

  // No block of core is replaced here today; the day one is, it draws
  // every core look or says which it hides (see docs-showcase's spec).
  it('draws every core look of a block it replaces, or hides it', () => {
    const overrideSources = Object.fromEntries(
      Object.entries(
        import.meta.glob<string>('./*.astro', {
          query: '?raw',
          import: 'default',
          eager: true,
        }),
      ).map(([path, source]) => [
        path.slice(path.lastIndexOf('/') + 1, -'.astro'.length),
        source,
      ]),
    );
    const extensions = collectThemeVariantExtensions(
      import.meta.glob<ThemeBlockVariantModule>('./*.variants.ts', {
        eager: true,
      }),
    );

    expect(
      checkOverridesDrawVariants(
        overrideSources,
        extensions,
        CORE_BLOCK_VARIANTS,
      ),
    ).toEqual([]);
  });
});
