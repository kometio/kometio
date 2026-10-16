import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The search page is core's, not a theme's, so it can only look right on a
 * theme it has never seen by reading that theme's tokens. It once carried a
 * grey for the excerpt and a yellow for the match: both a light site's, so
 * on `night` the excerpt was 2.5:1 and the match was pale text on pale
 * yellow. A literal colour in its stylesheet brings that back.
 */
const page = readFileSync(
  join(__dirname, '..', 'pages', '[locale]', 'search.astro'),
  'utf-8',
);

const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? '';

describe('search page colours', () => {
  it('has a stylesheet to check', () => {
    expect(style).toContain('.kometio-search-results__list');
  });

  it('writes no colour of its own', () => {
    const withoutComments = style.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(withoutComments).not.toMatch(
      /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/,
    );
  });

  it('draws the excerpt and the match from the theme', () => {
    expect(style).toMatch(
      /__list p\s*\{[^}]*color:\s*var\(--muted-foreground\)/,
    );
    expect(style).toMatch(
      /__list mark\s*\{[^}]*background:[^;]*var\(--kometio-warning\)[^;]*var\(--background\)/,
    );
    expect(style).toMatch(/__list mark\s*\{[^}]*color:\s*var\(--foreground\)/);
  });
});
