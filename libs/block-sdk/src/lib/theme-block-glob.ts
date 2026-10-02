import type { BlockDescriptor } from './field-types';
import type { ThemeBlockCandidate } from './validate-theme-blocks';

/**
 * Shapes three `import.meta.glob({ eager: true })` result maps — one each
 * for `*.block.ts`, `*.astro`, `*.locales.json` inside a `themes/<name>/
 * blocks/` directory — into `ThemeBlockCandidate[]`, ready for
 * `validateThemeBlockSet()`. Pure and Vite-agnostic (accepts plain glob
 * result objects, doesn't call `import.meta.glob` itself) so it's
 * reusable both by the real production loader
 * (apps/public-site/src/lib/resolve-theme-page-blocks.ts) and by each
 * theme's own `blocks/blocks.spec.ts` — the exact same candidate-shaping
 * logic runs in both places, so a spec passing is real evidence the real
 * loader would also accept the same files.
 */
export function collectThemeBlockCandidates(
  blockModules: Record<string, { default: BlockDescriptor }>,
  astroModules: Record<string, unknown>,
  localesModules: Record<string, ThemeBlockCandidate['locales']>,
): ThemeBlockCandidate[] {
  const astroBasenames = new Set(
    Object.keys(astroModules).map((path) => basenameOf(path, '.astro')),
  );
  const localesByBasename = new Map(
    Object.entries(localesModules).map(([path, content]) => [
      basenameOf(path, '.locales.json'),
      content,
    ]),
  );

  return Object.entries(blockModules).map(([path, mod]) => {
    const basename = basenameOf(path, '.block.ts');
    return {
      basename,
      descriptor: mod.default,
      hasRenderComponent: astroBasenames.has(basename),
      locales: localesByBasename.get(basename),
    };
  });
}

function basenameOf(globPath: string, suffix: string): string {
  const fileName = globPath.slice(globPath.lastIndexOf('/') + 1);
  return fileName.endsWith(suffix)
    ? fileName.slice(0, -suffix.length)
    : fileName;
}
