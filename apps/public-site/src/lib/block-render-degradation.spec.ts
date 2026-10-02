import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every block on a page renders through the same `BlockRenderer.astro`,
 * so what it does with a block it cannot validate decides what happens
 * to the other thirty. It used to call `schema.parse()`, which throws:
 * one block whose saved props no longer matched took the WHOLE page's
 * content down — layout and navigation still rendered, every block
 * vanished. Publishing a heading with a level the running code did not
 * yet accept blanked all 100 pages of the documentation site at once.
 *
 * Read from the source because an `.astro` component cannot be rendered
 * in this test environment (see `vitest-astro-glob-limitation`); the
 * behaviour itself was verified against the served site, with and
 * without `embedded=1`.
 */
const renderer = readFileSync(
  join(import.meta.dirname, '../components/BlockRenderer.astro'),
  'utf8',
);

describe('a block that cannot be validated', () => {
  it('is checked with safeParse, which does not throw', () => {
    expect(renderer).toContain('schema ? schema.safeParse(');
  });

  // One list of schemas for the renderer and the API alike.
  it("takes a core block's schema from the shared list", () => {
    expect(renderer).toContain('BLOCK_PROPS_SCHEMAS[block.type]');
    expect(renderer).not.toMatch(/schema: \w+PropsSchema/);
  });

  it('never reaches for the throwing parse again', () => {
    // `schema.parse(` anywhere in this file is the regression itself.
    const throwing = renderer.match(/\bschema\.parse\(/g) ?? [];
    expect(throwing).toEqual([]);
  });

  it('is skipped rather than rendered with empty props', () => {
    expect(renderer).toContain('entry && !isUnrenderable');
    expect(renderer).toContain('Component && entry && !isUnrenderable');
  });

  it('leaves a reason in the server log, since nobody reports a missing paragraph', () => {
    expect(renderer).toMatch(
      /console\.error\([\s\S]{0,200}does not match its schema/,
    );
  });

  it('tells the person editing the page, and only them', () => {
    expect(renderer).toContain('<UnrenderableBlockHint');
    // `editable` is the canvas, never the published page.
    expect(renderer).toMatch(
      /<UnrenderableBlockHint[\s\S]{0,120}show=\{editable === true\}/,
    );
  });

  it('names the block type in both languages the runtime speaks', () => {
    for (const locale of ['en', 'it']) {
      const catalogue = JSON.parse(
        readFileSync(
          join(
            import.meta.dirname,
            '../../../../libs/theme-runtime/src/lib/locales',
            `${locale}.json`,
          ),
          'utf8',
        ),
      ) as Record<string, string>;
      expect(catalogue['blockRenderer.unrenderable'], locale).toContain(
        '{type}',
      );
    }
  });
});
