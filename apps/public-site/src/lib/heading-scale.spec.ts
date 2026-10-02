import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageBlocks } from '@kometio/block-registry';
import { headingPropsSchema } from '@kometio/shared-types';

/**
 * Tailwind's preflight sets every `h1`-`h6` to `font-size: inherit;
 * font-weight: inherit`. Nothing in this repo put them back — not
 * global.css, not `themes/classic/theme.css`, not
 * `themes/docs-showcase/theme.css` — so a Heading block rendered
 * identically to a paragraph on every site Kometio shipped.
 *
 * The rules live in global.css rather than in a theme because a theme
 * that forgets them reproduces exactly that bug; a theme retunes the
 * scale through the `--kometio-h*-size` custom properties instead, which
 * PageLayout emits from the theme's own `:root` with `!important`.
 */
const globalCss = readFileSync(
  join(__dirname, '..', 'styles', 'global.css'),
  'utf-8',
);

function levelOptions(): string[] {
  const heading = pageBlocks.find((block) => block.type === 'Heading');
  if (!heading) throw new Error('the Heading block is no longer registered');
  const level = heading.fields.find((field) => field.key === 'level');
  if (!level || !('options' in level)) {
    throw new Error('the Heading block no longer offers a level field');
  }
  return level.options.map((option) => option.value);
}

describe('heading scale', () => {
  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])(
    'gives %s a font-size of its own, against preflight',
    (tag) => {
      expect(globalCss).toMatch(
        new RegExp(
          `\\b${tag}\\s*\\{[^}]*font-size:\\s*var\\(--kometio-${tag}-size`,
        ),
      );
    },
  );

  it('declares a fallback for every size token the rules read', () => {
    for (const token of globalCss.match(/--kometio-h\d-size/g) ?? []) {
      expect(globalCss).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
    }
  });

  it('never redefines the --text-* scale, which drives Tailwind utilities', () => {
    // Redefining those would resize every `text-2xl` class on the site as
    // a side effect of styling a heading.
    expect(globalCss).not.toMatch(/^\s*--text-[a-z0-9]+:/m);
  });

  it('offers every heading level the props schema accepts', () => {
    for (const value of levelOptions()) {
      expect(headingPropsSchema.parse({ text: 'x', level: value })).toEqual({
        text: 'x',
        level: value,
      });
    }
  });

  it('offers h1, so a page can have a top-level heading without a Hero', () => {
    expect(levelOptions()).toContain('h1');
  });
});
