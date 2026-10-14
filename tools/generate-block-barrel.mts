/**
 * Writes `libs/block-registry/src/lib/blocks/index.ts`: the barrel of the core
 * blocks, one export for each `*.block.ts` in the directory.
 *
 *   pnpm run blocks:barrel
 *
 * Generated and not written by hand (see block-barrel.ts); the registry's own
 * spec (`block-barrel.spec.ts`) fails, naming this command, when it has fallen
 * behind.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
  readBlockFiles,
  renderBlocksBarrel,
} from '../libs/block-registry/src/lib/block-barrel';

const DIRECTORY = join(
  import.meta.dirname,
  '../libs/block-registry/src/lib/blocks',
);
const BARREL = join(DIRECTORY, 'index.ts');

const files = readBlockFiles(DIRECTORY);
// As the repository formats TypeScript, so that a commit's own formatting pass
// does not change what this wrote.
const options = (await resolveConfig(BARREL)) ?? {};
writeFileSync(
  BARREL,
  await format(renderBlocksBarrel(files), { ...options, parser: 'typescript' }),
);
console.log(`${BARREL}: ${files.length} blocks`);
