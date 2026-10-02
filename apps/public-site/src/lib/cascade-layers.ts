/**
 * The rank of every cascade layer on a page, lowest first.
 *
 * A layer's rank is fixed by the FIRST rule in the document that names it,
 * and a dotted name is a sublayer: `kometio.instance` creates `kometio` too. The
 * per-request block styles are an inline `<style>` in the head, and the
 * bundled stylesheet — Tailwind's layers, then `kometio.base` — is linked
 * AFTER it. So on any page with a styled block, `kometio` was ranked before
 * Tailwind's `base`, whose reset (`* { margin: 0 }`) then beat every block
 * rule; and `kometio.base`, named last, beat the site's own overrides. A
 * margin set on a block showed as nothing.
 *
 * Emitted as the first thing in the head, so the order is this line and not
 * a property of where a build tool happens to put a `<link>`. Tailwind's
 * names are its own (`properties` is the compiler's, before `theme`); ours
 * come after all of them, in the order docs/adr/0050 describes.
 */
export const CASCADE_LAYER_ORDER = [
  'properties',
  'theme',
  'base',
  'components',
  'utilities',
  'kometio.base',
  'kometio.class',
  'kometio.instance',
] as const;

export const CASCADE_LAYER_ORDER_CSS = `@layer ${CASCADE_LAYER_ORDER.join(', ')};`;
