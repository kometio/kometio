/**
 * Records that a theme's replacements of core blocks have been compared with
 * core as it is now (themes/README.md, "A replacement follows core by hand").
 *
 *   pnpm run theme:copies-reviewed docs-showcase            # every copy
 *   pnpm run theme:copies-reviewed docs-showcase Button Code # only these
 *
 * Writes `themes/<theme>/blocks/core-copies.json`. Run it AFTER reading what
 * changed in core's file and bringing over what applies: the fingerprint says
 * that somebody looked, and it is the only thing that does.
 */
// By path, not by package name (`tools/` is outside the pnpm workspace), and
// with the `.ts` extension: Node strips the types itself, no loader needed.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  coreCopiesManifestFor,
  type CoreCopiesManifest,
} from '../libs/block-sdk/src/lib/theme-core-copies.ts';

const root = join(import.meta.dirname, '..');
const [theme, ...only] = process.argv.slice(2);
if (!theme) {
  console.error('usage: theme:copies-reviewed <theme> [<BlockType>…]');
  process.exit(2);
}

const astroIn = (directory: string): Record<string, string> =>
  existsSync(directory)
    ? Object.fromEntries(
        readdirSync(directory)
          .filter((file) => file.endsWith('.astro'))
          .map((file) => [
            file.slice(0, -'.astro'.length),
            readFileSync(join(directory, file), 'utf8'),
          ]),
      )
    : {};

const blocksDir = join(root, 'themes', theme, 'blocks');
if (!existsSync(blocksDir)) {
  console.error(`no such theme: themes/${theme}/blocks`);
  process.exit(2);
}
const manifestPath = join(blocksDir, 'core-copies.json');
const recorded: CoreCopiesManifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {};

const everything = coreCopiesManifestFor(
  astroIn(blocksDir),
  astroIn(join(root, 'apps/public-site/src/components/blocks')),
);
const unknown = only.filter((type) => !(type in everything));
if (unknown.length > 0) {
  console.error(
    `not a replacement of a core block in themes/${theme}: ${unknown.join(', ')}`,
  );
  process.exit(2);
}
const next = Object.fromEntries(
  Object.entries(everything).filter(
    ([type]) => only.length === 0 || only.includes(type) || type in recorded,
  ),
);
// Types that were recorded and are not named keep what was recorded: only the
// ones named are said to have been looked at.
for (const type of Object.keys(next)) {
  if (only.length > 0 && !only.includes(type) && recorded[type] !== undefined) {
    next[type] = recorded[type];
  }
}
if (Object.keys(next).length === 0 && !existsSync(manifestPath)) {
  console.log(`themes/${theme} replaces no core block: nothing to record`);
  process.exit(0);
}
writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `themes/${theme}/blocks/core-copies.json: ${Object.keys(next).join(', ') || '(none)'}`,
);
