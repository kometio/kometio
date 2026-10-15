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

/** The text inside the braces that `opening` opens, nested braces honoured. */
function bracedBlock(css: string, opening: string): string {
  const start = css.indexOf('{', css.indexOf(opening));
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(start + 1, i);
  }
  throw new Error(`no closing brace after ${opening}`);
}

interface FlatRule {
  selectors: string[];
  declarations: string;
}

/** A selector list split at its commas, but not at the ones inside `:is( … )`. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

/** The rules of a flat (no nested at-rule) run of CSS, whitespace and comments gone. */
function flatRules(css: string): FlatRule[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [selectorText = '', declarations = ''] = chunk.split('{');
      return {
        selectors: splitTopLevel(selectorText).map((s) =>
          s.replace(/\s+/g, ' ').trim(),
        ),
        declarations: declarations.replace(/\s+/g, ' ').trim(),
      };
    });
}

const SITE_OFF = "html[data-kometio-motion='off']";

/**
 * A site whose owner turned motion off is held to what a reader who asked
 * their system for less is (docs/adr/0142). Two rules cannot share a media
 * query and an attribute, so the second is a copy of the first under the
 * attribute — and this is what keeps the copy from being the one somebody
 * forgot to update.
 */
describe('a site whose owner turned motion off', () => {
  const reducedRules = flatRules(
    bracedBlock(GLOBAL_CSS, '@media (prefers-reduced-motion: reduce)'),
  );
  const offRules = flatRules(
    GLOBAL_CSS.split('}')
      .filter((chunk) => chunk.includes(SITE_OFF))
      .map((chunk) => `${chunk}}`)
      .join(''),
  );

  /** Where a selector of the reduced-motion block goes under the attribute. */
  function counterpart(selector: string): string {
    if (selector === '*') return `${SITE_OFF} *`;
    if (selector.startsWith('*::')) return `${SITE_OFF} ${selector}`;
    if (selector.startsWith('::view-transition'))
      return `${SITE_OFF}${selector}`;
    return `${SITE_OFF} ${selector}`;
  }

  it('is given every rule a reader who asked for less is given', () => {
    expect(reducedRules.length).toBeGreaterThan(0);
    for (const rule of reducedRules) {
      const expected = rule.selectors.map(counterpart);
      const given = offRules.some(
        (candidate) =>
          candidate.declarations === rule.declarations &&
          expected.every((selector) => candidate.selectors.includes(selector)),
      );

      expect(
        given,
        `nothing under the attribute for ${rule.selectors.join(', ')}`,
      ).toBe(true);
    }
  });

  it('is not given a rule the media query does not have', () => {
    const known = new Set(reducedRules.map((rule) => rule.declarations));
    for (const rule of offRules) {
      expect(known.has(rule.declarations), rule.declarations).toBe(true);
    }
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
