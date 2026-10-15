import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_TRANSITION_CSS } from './page-transition-css';

const GLOBAL_CSS = readFileSync(
  join(import.meta.dirname, '../styles/global.css'),
  'utf8',
);
const REPO = join(import.meta.dirname, '../../../..');

/** The rules that mention the part-by-part reveal, as the text of global.css gives them. */
function revealRules(): string[] {
  return GLOBAL_CSS.split('}')
    .map((rule) => rule.trim())
    .filter((rule) => rule.includes('data-kometio-reveal'));
}

/**
 * The motion a theme can ask for (docs/adr/0141) is only safe because of
 * how it is gated, and every one of these is the kind of mistake that no
 * type or build notices: a reader sees an empty page, or a page that slides
 * when they asked it not to.
 */
describe('the motion a theme asks for', () => {
  it('starts every part on a first frame only under the class JavaScript adds, and only inside a root block', () => {
    const rules = revealRules().filter((rule) => rule.includes('animation:'));

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      if (rule.includes('none !important')) continue;
      expect(rule, 'a reveal that hides without the class').toContain(
        '.kometio-motion-ready',
      );
      // Only a root block is ever told it has arrived: a part marked
      // anywhere else would wait for a signal that never comes.
      expect(rule, 'a reveal outside a root block').toContain(
        '.kometio-root-block',
      );
    }
  });

  it('leaves the editor’s canvas alone', () => {
    const hiding = revealRules().filter(
      (rule) => rule.includes('paused') || rule.includes('running'),
    );

    for (const rule of hiding) {
      expect(rule).toContain(':not([data-kometio-canvas])');
    }
  });

  it('drops the reveal outright for a reader who asked for less, and for paper', () => {
    const reduced = GLOBAL_CSS.slice(
      GLOBAL_CSS.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    const print = GLOBAL_CSS.slice(GLOBAL_CSS.indexOf('@media print'));

    expect(reduced).toContain('data-kometio-reveal');
    expect(reduced).toContain('::view-transition-old(*)');
    expect(reduced).toContain('::view-transition-new(*)');
    expect(reduced).toContain('::view-transition-group(*)');
    expect(print).toContain('data-kometio-reveal');
  });

  it('is off until a theme turns it on', () => {
    expect(GLOBAL_CSS).toMatch(/--kometio-motion-reveal:\s*none;/);
    expect(GLOBAL_CSS).toMatch(/--kometio-motion-stagger:\s*0ms;/);
    expect(GLOBAL_CSS).toMatch(/--kometio-motion-lift:\s*0px;/);
    expect(GLOBAL_CSS).toMatch(/--kometio-motion-press:\s*1;/);
  });

  it('animates colour, border, shadow, opacity and transform on a control — never a length, and never the outline', () => {
    const rule = GLOBAL_CSS.slice(
      GLOBAL_CSS.indexOf('transition-property:'),
      GLOBAL_CSS.indexOf('transition-duration:'),
    );

    expect(rule).toContain('color');
    expect(rule).toContain('transform');
    for (const layout of [
      'width',
      'height',
      'margin',
      'padding',
      'top',
      'left',
    ]) {
      expect(rule).not.toMatch(new RegExp(`\\b${layout}\\b`));
    }
    expect(rule).not.toContain('outline');
    expect(rule).not.toContain('all');
  });
});

describe('moving from one page to the next', () => {
  it('only asks the browser for a transition from a reader who did not ask for less', () => {
    const wrapped = PAGE_TRANSITION_CSS.indexOf('@view-transition');
    const media = PAGE_TRANSITION_CSS.indexOf(
      '@media (prefers-reduced-motion: no-preference)',
    );

    expect(media).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeGreaterThan(media);
  });

  it('keeps the header and the footer out of the cross-fade', () => {
    expect(PAGE_TRANSITION_CSS).toContain('body > header');
    expect(PAGE_TRANSITION_CSS).toContain('body > footer');
  });

  it('moves opacity and a few pixels of transform and nothing that lays out', () => {
    const keyframes = PAGE_TRANSITION_CSS.slice(
      PAGE_TRANSITION_CSS.indexOf('@keyframes'),
    );

    expect(keyframes).toContain('opacity');
    expect(keyframes).not.toMatch(
      /\b(width|height|margin|padding|top|left)\s*:/,
    );
  });
});

describe('the themes that ask for it', () => {
  it('say so in a manifest the layout reads', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(join(REPO, 'themes/docs-showcase/theme.json'), 'utf8'),
    );

    expect(manifest).toMatchObject({ pageTransitions: true });
  });

  it('keep motion off the themes that never asked', () => {
    const classic = readFileSync(
      join(REPO, 'themes/classic/theme.css'),
      'utf8',
    );
    const manifest: unknown = JSON.parse(
      readFileSync(join(REPO, 'themes/classic/theme.json'), 'utf8'),
    );

    expect(classic).not.toContain('--kometio-motion-reveal');
    expect(manifest).not.toHaveProperty('pageTransitions');
  });
});
