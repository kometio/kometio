import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A theme declares its `:root` custom properties in `theme.css`, and
 * PageLayout emits every one of them with `!important` (ADR-0042 — a
 * per-request theme cannot be a static CSS import, so source order is
 * not available to settle the cascade).
 *
 * That makes any name a theme shares with Tailwind's own theme
 * variables a silent override of Tailwind's UTILITY CLASSES, inside
 * Kometio's own components. `themes/classic/theme.css` declared
 * `--text-sm`..`--text-4xl` and `--leading-*` this way: nothing read
 * them as `var(--text-*)`, but every `text-lg` and `text-4xl` in
 * `Hero.astro` quietly resized on any site using that theme.
 *
 * The contract this test enforces: a theme names its values in the
 * plain namespace Kometio defines (`--primary`, `--foreground`,
 * `--kometio-*`), and `global.css`'s `@theme inline` block is the single
 * place that maps those into Tailwind's namespace.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const THEMES_DIR = join(REPO_ROOT, 'themes');

/**
 * Names Kometio deliberately shares with Tailwind, each because something
 * in the app reads it on purpose:
 *   --radius     mapped to --radius-md/--radius-lg by global.css's `@theme inline`
 *   --shadow-*   read as `var(--shadow-md)` by Card.astro and global.css
 */
const SHARED_WITH_TAILWIND = [/^--radius$/, /^--shadow-/];

function rootCustomProperties(css: string): string[] {
  const blocks = css.match(/:root\s*\{[^}]*\}/g) ?? [];
  return blocks.flatMap((block) =>
    [...block.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].flatMap(
      (match) => match[1] ?? [],
    ),
  );
}

const tailwindTheme = readFileSync(
  join(REPO_ROOT, 'node_modules', 'tailwindcss', 'theme.css'),
  'utf-8',
);
const tailwindNames = new Set(
  [...tailwindTheme.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]),
);

const themeNames = readdirSync(THEMES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('theme tokens', () => {
  it('reads Tailwind’s own theme variables, so the check has teeth', () => {
    expect(tailwindNames.size).toBeGreaterThan(50);
    expect(tailwindNames.has('--text-2xl')).toBe(true);
  });

  it.each(themeNames)(
    '%s declares nothing that would silently retune a Tailwind utility',
    (name) => {
      const css = readFileSync(join(THEMES_DIR, name, 'theme.css'), 'utf-8');
      const clashing = rootCustomProperties(css).filter(
        (property) =>
          tailwindNames.has(property) &&
          !SHARED_WITH_TAILWIND.some((allowed) => allowed.test(property)),
      );
      expect(clashing, `${name}/theme.css`).toEqual([]);
    },
  );
});
