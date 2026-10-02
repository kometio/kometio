import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockAnimationSchema } from '@kometio/shared-types';

const GLOBAL_CSS = readFileSync(
  join(import.meta.dirname, '../styles/global.css'),
  'utf8',
);

/**
 * The invariant docs/adr/0060 asks for, and the family of defect it
 * belongs to.
 *
 * `animation-name` pointing at keyframes nobody defined is not an error:
 * CSS drops the declaration and the block simply never animates. Somebody
 * would pick "Zoom in" from the menu, watch nothing happen, and conclude
 * they had done it wrong — the same silence as a `@container` query with
 * no container, which is why that one is a test too.
 *
 * It runs from the vocabulary, not from a list written here: a value
 * added to `blockAnimationSchema` with no keyframes to match fails the
 * moment it is added.
 */
describe('every animation in the vocabulary has keyframes', () => {
  const animations = blockAnimationSchema
    .unwrap()
    .options.filter((option) => option !== 'none');

  it('finds the animations it is meant to be checking', () => {
    expect(animations.length).toBeGreaterThan(0);
  });

  it.each(animations.map((name) => [name] as const))(
    '%s is defined in global.css',
    (name) => {
      expect(GLOBAL_CSS).toContain(`@keyframes kometio-${name} `);
    },
  );

  /**
   * The other half, and the one a reader would actually be hurt by: with
   * JavaScript off nothing adds `.kometio-motion-ready`, so every animation
   * rule has to hang off it. A rule that did not would leave the page on
   * the animation's first frame — `opacity: 0` — for ever.
   */
  it('gates every entrance rule on the class JavaScript adds', () => {
    const entranceRules = GLOBAL_CSS.split('\n').filter(
      (line) =>
        line.includes('animation:') && line.includes('--kometio-anim-name'),
    );
    expect(entranceRules.length).toBeGreaterThan(0);
    for (const rule of entranceRules) {
      const index = GLOBAL_CSS.indexOf(rule);
      const preceding = GLOBAL_CSS.slice(Math.max(0, index - 200), index);
      expect(preceding).toContain('.kometio-motion-ready');
    }
  });

  /**
   * Accessibility, not polish. Before docs/adr/0060 the product shipped
   * transitions and four smooth scrolls without one of these blocks.
   */
  it('answers prefers-reduced-motion', () => {
    expect(GLOBAL_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
