import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkOverridesTrackCore,
  type CoreCopiesManifest,
} from '@kometio/block-sdk';

const ROOT = join(import.meta.dirname, '../../../..');
const THEMES_DIR = join(ROOT, 'themes');
const CORE_BLOCKS_DIR = join(ROOT, 'apps/public-site/src/components/blocks');

/** Each `<Type>.astro` of a folder, by `Type`. */
function astroSourcesIn(directory: string): Record<string, string> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory)
      .filter((file) => file.endsWith('.astro'))
      .map((file) => [
        file.slice(0, -'.astro'.length),
        readFileSync(join(directory, file), 'utf8'),
      ]),
  );
}

/**
 * A theme that replaces a core block is a copy of it, and core's fixes do not
 * reach a copy (the docs theme's Button once fell four props behind). Each
 * theme records, in `blocks/core-copies.json`, a fingerprint of the core file
 * it was last compared with; when core's file changes this fails, naming the
 * theme and the block, until somebody has read the change and recorded the new
 * fingerprint — `pnpm run theme:copies-reviewed <theme> [<Type>…]`.
 *
 * It lives here, with the core blocks, and scans `themes/` so that a theme
 * added tomorrow is covered without anybody wiring it up. A change to a core
 * block is what fails, in the pull request that makes it.
 */
describe('a theme that replaces a core block has compared it with core as it is', () => {
  const coreSources = astroSourcesIn(CORE_BLOCKS_DIR);
  const themes = readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('finds the core blocks and the themes it is meant to be checking', () => {
    expect(Object.keys(coreSources).length).toBeGreaterThan(50);
    expect(themes).toContain('docs-showcase');
  });

  it.each(themes)('%s', (theme) => {
    const blocksDir = join(THEMES_DIR, theme, 'blocks');
    const manifestPath = join(blocksDir, 'core-copies.json');
    const manifest: CoreCopiesManifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8'))
      : {};

    const problems = checkOverridesTrackCore(
      astroSourcesIn(blocksDir),
      coreSources,
      manifest,
    ).map((problem) => {
      const how = problem.message.includes('no longer replaces')
        ? ''
        : `  →  pnpm run theme:copies-reviewed ${theme} ${problem.blockType}`;
      return `${theme}/${problem.blockType}: ${problem.message}${how}`;
    });

    expect(problems).toEqual([]);
  });
});
