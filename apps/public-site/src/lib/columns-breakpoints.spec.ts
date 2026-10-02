import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BREAKPOINT_MAX_WIDTHS } from '@kometio/shared-types';

/*
 * Columns.astro cannot read BREAKPOINT_MAX_WIDTHS from CSS: a container
 * query's condition may not contain `var()` — custom properties resolve
 * too late, and a rule written that way never matches, with no error
 * anywhere to say so. The widths are therefore written out as literals,
 * and this reads them back.
 *
 * Without it, changing a breakpoint in shared-types would move every
 * per-breakpoint style rule (ADR-0047) while leaving columns stacking at
 * the old width — the two would disagree, and nothing would say which was
 * right.
 */
const source = readFileSync(
  join(__dirname, '../components/blocks/Columns.astro'),
  'utf8',
);

describe('Columns stacking breakpoints', () => {
  it.each([
    ['tablet', BREAKPOINT_MAX_WIDTHS.tablet],
    ['mobile', BREAKPOINT_MAX_WIDTHS.mobile],
  ])(
    'stacks at the %s width the rest of the styling system uses (%ipx)',
    (tier, width) => {
      const rule = new RegExp(
        `@container \\(max-width: ${width}px\\)[^}]*\\.kometio-columns--stack-${tier}`,
      );
      expect(source).toMatch(rule);
    },
  );

  it('asks the container how wide it is, never the window', () => {
    // The rule this replaced was `@media (max-width: 640px)`, which broke
    // a row of columns nested in a narrow track on a wide screen: it
    // asked the WINDOW, so the row stayed side-by-side inside a 300px
    // track on a desktop.
    //
    // Comments stripped first — this file explains what it replaced, and
    // matching the explanation would make the test pass or fail on prose.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/@media\s*\(/);
  });
});
