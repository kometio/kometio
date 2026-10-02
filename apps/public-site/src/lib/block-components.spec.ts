import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';

const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');
const THEMES_DIR = join(import.meta.dirname, '../../../../themes');

const files = readdirSync(BLOCKS_DIR).filter((name) => name.endsWith('.astro'));
const types = new Set(
  [...pageBlocks, ...headerFooterBlocks].map((d) => d.type),
);

/**
 * A core block is drawn by `components/blocks/<Type>.astro`, found by that
 * name: no list beside the descriptors says which file is which
 * (block-dispatch-for-theme.ts). The two sides are held to each other here.
 */
describe('components/blocks and the block registry', () => {
  it('has a component for every registered type', () => {
    const present = new Set(files.map((name) => name.replace(/\.astro$/, '')));

    expect([...types].filter((type) => !present.has(type)).sort()).toEqual([]);
  });

  it('holds only components of registered types — a partial belongs in components/parts/', () => {
    const stray = files
      .map((name) => name.replace(/\.astro$/, ''))
      .filter((name) => !types.has(name));

    expect(stray.sort()).toEqual([]);
  });
});

/**
 * Every block is handed the page context (`locale`, `site`, `editable`, ...)
 * whether it reads it or not (block-render-context.ts). That is free only
 * while nothing forwards `Astro.props` wholesale into markup, where an
 * unread prop would surface as an attribute.
 */
describe('block components do not forward their props into markup', () => {
  const themeBlockFiles = readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((theme) => {
      try {
        return readdirSync(join(THEMES_DIR, theme.name, 'blocks'))
          .filter((name) => name.endsWith('.astro'))
          .map((name) => join(THEMES_DIR, theme.name, 'blocks', name));
      } catch {
        return [];
      }
    });
  const all = [
    ...files.map((name) => join(BLOCKS_DIR, name)),
    ...themeBlockFiles,
  ];

  it('reads the components it is meant to be checking', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('spreads neither Astro.props nor a rest of them', () => {
    const offenders = all.filter((path) =>
      /\{\s*\.\.\.(?:Astro\.props|rest|props|attrs|restProps)\b/.test(
        readFileSync(path, 'utf8'),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
