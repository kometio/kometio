import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { normalizeRichText } from '@kometio/rich-text';
import { listThemePageBlocks } from './resolve-theme-page-blocks';

const CORE_BLOCK_TYPES = [...pageBlocks, ...headerFooterBlocks].map(
  (descriptor) => descriptor.type,
);

function richTextFieldsFor(themeName: string): Set<string> {
  const keys = new Set<string>();
  for (const descriptor of [
    ...pageBlocks,
    ...headerFooterBlocks,
    ...listThemePageBlocks(CORE_BLOCK_TYPES, themeName).map(
      (entry) => entry.descriptor,
    ),
  ]) {
    for (const field of descriptor.fields) {
      if (field.kind === 'richtext') {
        keys.add(`${descriptor.type}.${field.key}`);
      }
    }
  }
  return keys;
}

/**
 * Keyed by theme, not global: `Site.themeName` is per-site and switchable
 * at runtime (ADR-0042), so one deployment serving two sites has two
 * different sets of blocks, and a single cache would normalise one site's
 * content against the other's registry.
 */
const cache = new Map<string, Set<string>>();

function richTextFields(themeName: string): Set<string> {
  let keys = cache.get(themeName);
  if (!keys) {
    keys = richTextFieldsFor(themeName);
    cache.set(themeName, keys);
  }
  return keys;
}

/**
 * The last thing that happens to rich text before it is rendered with
 * `set:html` — the second of the two barriers ADR-0046 asks for.
 *
 * The first is the API, which sanitises on write so the database stays
 * clean and search, exports and API responses never handle untrusted
 * HTML. It cannot be the only one: a THEME's blocks are TypeScript
 * modules under `themes/<name>/blocks/`, compiled in here by
 * `import.meta.glob` at build time, and a running Node API cannot load
 * them — so a theme's own rich text field would pass the API unexamined.
 * Here the registry is complete.
 *
 * It also normalises, which is what makes an upgrade safe: every one of
 * these fields held PLAIN text before this shipped, and the migration
 * script is run by hand. A deployment that has not run it still renders
 * `Rossi & Figli` correctly instead of losing half the line.
 *
 * It lives on the per-BLOCK path, not on the fetch: every block on every
 * page goes through BlockRenderer, so coverage is by construction rather
 * than by remembering to call it at each place content arrives. Doing it
 * on the fetch instead is also what broke five spec files — this module
 * reaches `import.meta.glob` over `.astro`, which Vitest cannot parse,
 * so anything a spec imports must not lead here.
 *
 * Sanitising twice costs nothing and changes nothing: the operation is
 * idempotent, with a test that says so.
 */
export function normalizeRenderedProps(
  blockType: string,
  props: Record<string, unknown>,
  themeName: string,
): Record<string, unknown> {
  const keys = richTextFields(themeName);
  let next = props;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string' || !keys.has(`${blockType}.${key}`)) {
      continue;
    }
    const normalized = normalizeRichText(value);
    if (normalized !== value) {
      next = next === props ? { ...props } : next;
      next[key] = normalized;
    }
  }
  return next;
}
