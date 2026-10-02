import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';

const THEMES_DIR = join(import.meta.dirname, '../../../../themes');

/** Block type -> the field keys of that type whose value is HTML. */
const RICH_TEXT_FIELDS = new Map(
  [...pageBlocks, ...headerFooterBlocks]
    .map((descriptor) => ({
      type: descriptor.type,
      keys: descriptor.fields
        .filter((field) => field.kind === 'richtext')
        .map((field) => field.key),
    }))
    .filter(({ keys }) => keys.length > 0)
    .map(({ type, keys }) => [type, keys] as const),
);

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function themeBlockOverrides() {
  return list(THEMES_DIR).flatMap((theme) => {
    const dir = join(THEMES_DIR, theme, 'blocks');
    return list(dir)
      .filter((file) => file.endsWith('.astro'))
      .map((file) => ({ theme, file, type: file.replace(/\.astro$/, '') }))
      .filter(({ type }) => RICH_TEXT_FIELDS.has(type))
      .map((entry) => ({
        ...entry,
        path: `themes/${entry.theme}/blocks/${entry.file}`,
        source: readFileSync(join(dir, entry.file), 'utf8'),
      }));
  });
}

/**
 * A theme may replace any core block's markup wholesale (ADR-0021), and
 * that is exactly where this goes wrong: a rich text field's value is
 * HTML (ADR-0046), so an override writing `{subtitle}` shows the reader a
 * literal `<p>` where a paragraph should be.
 *
 * Not hypothetical — `themes/docs-showcase/blocks/Hero.astro` did exactly
 * that, and typecheck, lint and the whole suite were green while a real
 * page served the tags as text. It was found by reading the HTML.
 *
 * The source is read rather than imported because this vitest project has
 * no Astro plugin and cannot transform `.astro`. Reading it is enough to
 * catch the one mistake that matters.
 */
describe('theme block overrides render rich text as HTML', () => {
  const overrides = themeBlockOverrides();

  // Without this a rename could leave the test passing while checking
  // nothing at all.
  it('finds the overrides it is meant to be checking', () => {
    expect(overrides.length).toBeGreaterThan(0);
  });

  it.each(overrides.map((o) => [o.path, o] as const))(
    '%s renders every rich text field with set:html',
    (_path, override) => {
      const asText = (RICH_TEXT_FIELDS.get(override.type) ?? []).filter((key) =>
        new RegExp(`[>}]\\s*\\{\\s*${key}\\s*\\}`).test(override.source),
      );

      expect(asText).toEqual([]);
    },
  );
});
