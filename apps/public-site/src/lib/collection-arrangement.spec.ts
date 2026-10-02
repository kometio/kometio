import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');

/*
 * Invariants about the shared arrangement engine (ADR-0052), each pinning a
 * mistake that was actually made while building it and that no other test
 * could see. (A further one — that every block with a display prop is handed
 * the locale its nav labels need — went when every block began to be handed
 * it: lib/block-render-context.ts.)
 */
describe('collection arrangement engine', () => {
  const usesLayout = readdirSync(BLOCKS_DIR)
    .filter((file) => file.endsWith('.astro'))
    .map((file) => ({
      file,
      source: readFileSync(join(BLOCKS_DIR, file), 'utf8'),
    }))
    .filter((block) => block.source.includes('CollectionLayout'));

  it('covers every block that hands its arrangement over', () => {
    // A guard on the guard: if this list ever empties, the two checks
    // below would pass by vacuum.
    expect(usesLayout.length).toBeGreaterThanOrEqual(6);
  });

  it.each(usesLayout.map((b) => b.file))(
    '%s styles its own class globally, because CollectionLayout renders it',
    (file) => {
      const source = usesLayout.find((b) => b.file === file)?.source ?? '';
      const styleBlock = source.slice(source.indexOf('<style>'));
      // Strip what is already inside a `:global(...)`, then nothing that
      // targets this engine's elements should be left: Astro scopes a
      // component's styles to the elements IT renders, and the root here
      // is rendered by CollectionLayout. A scoped rule simply never
      // matches — the block silently lost its grid entirely, measured as
      // `display: block` on the built page.
      const outsideGlobal = styleBlock.replace(/:global\([^)]*\)/g, '');
      const stranded = [...outsideGlobal.matchAll(/\.kometio-[\w-]+/g)].map(
        (match) => match[0],
      );

      expect(
        stranded,
        `${file}: these selectors must sit inside :global()`,
      ).toEqual([]);
    },
  );
});
