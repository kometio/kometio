import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as exported from './blocks';
import {
  blockExportOf,
  readBlockFiles,
  renderBlocksBarrel,
} from './block-barrel';
import { pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

const DIRECTORY = join(import.meta.dirname, 'blocks');

describe('the barrel of the core blocks', () => {
  /*
   * `blocks/index.ts` is made from the directory. A block file added or
   * removed by hand leaves it behind, and a block the barrel does not export
   * cannot be put in the picker.
   */
  it('lists every block file, as the generator would write it', () => {
    const onDisk = readFileSync(join(DIRECTORY, 'index.ts'), 'utf8');

    expect(
      // Formatting is the repository's (prettier), the content is the generator's.
      normalise(onDisk),
      'libs/block-registry/src/lib/blocks/index.ts is behind the directory: run `pnpm run blocks:barrel`',
    ).toEqual(normalise(renderBlocksBarrel(readBlockFiles(DIRECTORY))));
  });

  it('exports each descriptor under the name its file gives it', () => {
    for (const { exportName } of readBlockFiles(DIRECTORY)) {
      expect(Object.keys(exported)).toContain(exportName);
    }
  });

  /*
   * What the barrel cannot say is which blocks are offered: that is a list
   * (`pageBlocks`, `headerFooterBlocks`). A block that is in neither is a file
   * nobody can reach, and is almost always one that was forgotten.
   */
  it('has no block that is in neither the picker nor the header and footer', () => {
    const reachable = new Set(
      [...pageBlocks, ...headerFooterBlocks].map((block) => block.type),
    );

    const orphans = Object.entries(exported)
      .filter(([, block]) => !reachable.has(block.type))
      .map(([name]) => name);

    expect(orphans).toEqual([]);
  });
});

describe('blockExportOf', () => {
  it('reads the descriptor a file exports', () => {
    expect(
      blockExportOf(
        'a.block.ts',
        "import x from 'y';\n\nexport const accordionBlock = coreBlock(c, {});\n",
      ),
    ).toBe('accordionBlock');
  });

  it('refuses a file that exports none, naming it', () => {
    expect(() => blockExportOf('a.block.ts', 'export const x = 1;')).toThrow(
      /a\.block\.ts exports no/,
    );
  });
});

/** Quote style and trailing newline are prettier's; the lines are the generator's. */
function normalise(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/"/g, "'").trim())
    .filter(Boolean);
}
