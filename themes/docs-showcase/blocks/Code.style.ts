import type { ThemeStyleProperty } from '@kometio/block-sdk';

/**
 * A style property this theme adds to the CORE Code block (ADR-0047's
 * consequence on `stylableProperties`).
 *
 * The case it exists for: this theme draws a terminal window around a
 * snippet, and how bright its chrome sits against the page is a taste
 * call the AGENCY makes per site — not something core has a property for,
 * and not something the client should have to edit CSS to change.
 *
 * The variable is `--kometio-override-window-tint`, derived from the key:
 * a theme never names it, so it cannot collide with a core one or point
 * two properties at the same variable. Read in `Code.astro`.
 */
const properties: ThemeStyleProperty[] = [
  {
    key: 'windowTint',
    control: 'color',
    label: { en: 'Window chrome', it: 'Cornice della finestra' },
  },
];

export default properties;
