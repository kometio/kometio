import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const GLOBAL_CSS = readFileSync(join(SRC, 'styles/global.css'), 'utf8');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

/** A custom property's declared value in core's own `:root`. */
function token(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(GLOBAL_CSS)?.[1]?.trim();
}

/**
 * How the page grows with a large window (docs/adr/0143). A rule that is
 * wrong here is wrong at every width of every theme, and nothing in a
 * type or a build notices: the page is just a little larger or smaller.
 */
describe('the page growing with the window', () => {
  it('starts at 1440px, which is where the layout was designed to the edge', () => {
    expect(token('--kometio-scale-from')).toBe('1440px');
    // The shell is the window exactly where the scale starts, so nothing
    // at or below it moves.
    expect(token('--kometio-shell-width')).toBe('90rem');
  });

  it('is a percentage of the reader’s own size, never below it, never past a quarter more', () => {
    const rule = GLOBAL_CSS.slice(
      GLOBAL_CSS.indexOf('font-size: clamp('),
      GLOBAL_CSS.indexOf('var(--kometio-scale-max)'),
    );

    // The floor: 100%, the reader's default, not a number of pixels.
    expect(rule).toMatch(/clamp\(\s*100%,/);
    expect(rule).toContain('100vw - var(--kometio-scale-from)');
    expect(rule).toContain('var(--kometio-scale-rate)');
    expect(token('--kometio-scale-max')).toBe('125%');
  });

  it('can be frozen by a theme: the cap is a token, not a constant', () => {
    expect(GLOBAL_CSS).toContain('var(--kometio-scale-max)');
  });

  it('leaves the header and the footer on the page’s own gutter up to the shell width', () => {
    const rule = GLOBAL_CSS.slice(GLOBAL_CSS.indexOf('.kometio-shell-inset {'));

    expect(rule).toContain('var(--kometio-content-gutter)');
    expect(rule).toContain('(100% - var(--kometio-shell-width)) / 2');
  });

  it('is what core’s own header and footer use, instead of a fixed 24px', () => {
    for (const region of ['DefaultHeader', 'DefaultFooter']) {
      const markup = read(`components/regions/${region}.astro`);

      expect(markup, region).toContain('kometio-shell-inset');
      expect(markup, region).not.toMatch(/\bpx-6\b/);
    }
  });
});
