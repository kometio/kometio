import type { ThemeBlockVariant } from '@kometio/block-sdk';

/**
 * The looks this theme adds to the CORE Button (ADR-0047, under
 * ADR-0048's additive rule) — not a redefinition: core's own `secondary`
 * stays, and every Button already saved keeps working.
 *
 * This is the shape the Figma workflow arrives in. A design file hands
 * over a component with several button variants; each becomes an entry
 * here and a `.kometio-button--<value>` rule in `Button.astro`. Before
 * this, the only way was a whole `MyButton` block type, which duplicated
 * every field and lost the core Button along with it.
 *
 * Labels are strings, not i18n keys: a theme cannot add keys to the
 * editor's bundles at build time, so they travel with the data and are
 * registered on arrival.
 */
/*
 * `ghost` used to be declared here and is core's own look since ADR-0056
 * — a theme may not redeclare a core variant (ADR-0048's additive rule,
 * enforced by blocks.spec.ts). The theme's `.kometio-button--ghost` rule in
 * Button.astro still applies: what a look LOOKS like was always the
 * theme's business, and only the declaring moved.
 *
 * What is left is a look that is genuinely this theme's and that core has
 * no business shipping — the gradient this site uses for its own hero.
 */
const variants: ThemeBlockVariant[] = [
  {
    value: 'gradient',
    label: { en: 'Gradient', it: 'Sfumato' },
  },
];

export default variants;
