import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { blockTypeToClassName } from '@kometio/shared-types';

const GLOBAL_CSS = readFileSync(
  join(import.meta.dirname, '../styles/global.css'),
  'utf8',
);

/**
 * The selectors of the one rule that declares `container-type`, read from
 * the stylesheet rather than matched as a substring: the last selector in
 * the list ends with `{` and not a comma, so a substring search would
 * pass for fourteen blocks and fail for whichever one happens to be last.
 */
function selectorsDeclaringContainerType(): string[] {
  // Comments carry no braces, so a selector list read straight out of the
  // file would begin with whatever comment precedes the rule.
  const rule = /([^{}]+)\{[^{}]*container-type:\s*inline-size[^{}]*\}/.exec(
    GLOBAL_CSS.replace(/\/\*[\s\S]*?\*\//g, ''),
  );
  return (
    rule?.[1]
      ?.split(',')
      .map((selector) => selector.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * The invariant ADR-0047 asks for, and the reason it is a test rather
 * than a documentation page.
 *
 * A per-breakpoint rule is a `@container` query, and a `@container` query
 * with no ancestor declaring `container-type` **simply never matches**.
 * No error, no console warning, nothing in devtools marking the rule
 * inert — the family of defect this codebase keeps meeting. Somebody
 * would set a mobile value, watch nothing happen, and conclude they had
 * done it wrong.
 *
 * The places a block can live are few and enumerable: the page's own
 * column, the header and footer regions, and every block that can contain
 * other blocks. So coverage is complete by construction, provided the
 * list stays in step with the registry — which is what this checks.
 */
describe('every place a block can live measures itself', () => {
  const containerBlocks = [...pageBlocks, ...headerFooterBlocks].filter(
    (descriptor) => descriptor.isContainer,
  );

  const selectors = selectorsDeclaringContainerType();

  it('finds the container blocks it is meant to be checking', () => {
    expect(containerBlocks.length).toBeGreaterThan(0);
    expect(selectors.length).toBeGreaterThan(0);
  });

  it.each(containerBlocks.map((d) => [d.type] as const))(
    '%s declares container-type',
    (type) => {
      expect(selectors).toContain(`.${blockTypeToClassName(type)}`);
    },
  );

  /**
   * The fallback container every block falls back to, and the reason it
   * is `body` rather than the `<main>` column: that column is
   * `max-w-5xl px-6`, so its inline size never exceeds 976px and
   * `(max-width: 1024px)` would match on any screen at all — every
   * "Tablet" value would silently apply on desktop. Against `body` a
   * top-level block measures the viewport, which is the behaviour the
   * words Desktop/Tablet/Mobile promise.
   *
   * It also covers the header and footer, whose blocks render in regions
   * that are SIBLINGS of <main>: a container on the column alone would
   * have left every header block's per-breakpoint styling inert.
   */
  /*
   * `Section` is not in the derived list and has to be checked by name:
   * `isContainer` is false for it on purpose (nothing can be dropped into
   * a section instance, docs/adr/0059), but the section's own blocks are
   * rendered inside it at read time — so a container query in one of them
   * measures `.kometio-section`, and without the declaration it would never
   * match. The one case where "a block that holds blocks" and "a block the
   * editor lets you fill" come apart.
   */
  it('measures a section instance, which holds blocks without being a container', () => {
    expect(selectors).toContain('.kometio-section');
  });

  it('measures the page itself, not the content column', () => {
    expect(selectors).toContain('body');
    expect(selectors).not.toContain('main');
  });

  // `size` would make each of these depend on its own height, which
  // collapses it. Only the width is ever asked about.
  it('uses inline-size, never size', () => {
    expect(GLOBAL_CSS).toMatch(/container-type:\s*inline-size/);
    expect(GLOBAL_CSS).not.toMatch(/container-type:\s*size/);
  });
});

/**
 * The other half of the invariant, and the half a CSS-only check would
 * miss: declaring `container-type` on `.kometio-tabs` measures nothing
 * unless that class actually sits on an ANCESTOR of the blocks nested
 * inside. A container block whose class landed on an inner element —
 * beside the children rather than around them — would pass every check
 * above and still leave every nested block's per-breakpoint styling
 * inert.
 *
 * ADR-0047 asks for this over rendered HTML. It is checked over the
 * component source instead, because Vitest has no Astro plugin here
 * (see [[vitest-astro-glob-limitation]]) and there is no served-HTML test
 * harness in this workspace. The substitute is not a weaker claim: if the
 * class is on the ROOT element of the component, it is an ancestor of
 * everything the component renders, children included — which is exactly
 * what walking the ancestors would have established.
 */
describe('a container block wraps its children in the measured element', () => {
  const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');

  /**
   * The component's first opening tag, brace-aware: `class:list={[...]}`
   * and `data-x={a > b}` both contain `>` characters that would end the
   * tag too early for a naive scan.
   */
  function rootOpeningTag(source: string): string {
    const template = source.replace(/^---[\s\S]*?\n---/, '');
    const start = firstElementIndex(template);
    if (start === undefined) {
      return '';
    }
    let depth = 0;
    for (let i = start; i < template.length; i += 1) {
      const character = template[i];
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0)
        return template.slice(start, i);
    }
    return '';
  }

  /**
   * Where the first real element starts, stepping OVER comments rather
   * than deleting them.
   *
   * Deleting them would be simpler, and it is what this did first — but
   * several components open with a comment explaining the choice of
   * element, and those comments name elements: `<section>, not <header>`
   * would otherwise be read as the root tag. Skipping in one left-to-right
   * pass also avoids the shape of a "strip the markup and hope" replace,
   * which is the pattern that produced a real CodeQL finding in this
   * repository once already.
   */
  function firstElementIndex(template: string): number | undefined {
    const COMMENTS = [
      { open: '{/*', close: '*/}' },
      { open: '<!--', close: '-->' },
    ];
    let i = 0;
    while (i < template.length) {
      const comment = COMMENTS.find((c) => template.startsWith(c.open, i));
      if (comment) {
        const end = template.indexOf(comment.close, i + comment.open.length);
        if (end === -1) {
          return undefined;
        }
        i = end + comment.close.length;
        continue;
      }
      if (template[i] === '<' && /[A-Za-z]/.test(template[i + 1] ?? '')) {
        return i;
      }
      i += 1;
    }
    return undefined;
  }

  const containers = [...pageBlocks, ...headerFooterBlocks].filter(
    (descriptor) => descriptor.isContainer,
  );

  it.each(containers.map((d) => [d.type] as const))(
    '%s puts its class on the root element',
    (type) => {
      const source = readFileSync(join(BLOCKS_DIR, `${type}.astro`), 'utf8');
      expect(rootOpeningTag(source)).toContain(blockTypeToClassName(type));
    },
  );

  // `display: contents` removes the element's box, and an element with no
  // box measures nothing — the `container-type` declaration would be
  // silently dropped. The trap is easy to walk into because
  // `display: contents` is otherwise a natural choice for a wrapper that
  // should not disturb its parent's layout.
  it.each(containers.map((d) => [d.type] as const))(
    '%s keeps a box to measure',
    (type) => {
      const source = readFileSync(join(BLOCKS_DIR, `${type}.astro`), 'utf8');
      expect(source).not.toMatch(/display:\s*contents/);
    },
  );
});
