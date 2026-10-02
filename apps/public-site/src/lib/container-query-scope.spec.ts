import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { blockTypeToClassName } from '@kometio/shared-types';

const BLOCKS_DIR = join(import.meta.dirname, '../components/blocks');

/**
 * The trap this exists for, met while writing the Card (ADR-0058).
 *
 * An element never queries itself. A container block declares
 * `container-type` on its own root — it has to, so the blocks nested
 * inside it have something to measure ([[container-type.spec.ts]]) — and
 * that has a consequence which is easy to miss: inside that block's own
 * stylesheet, an `@container` rule for the ROOT resolves against the
 * block's ancestor, while an `@container` rule for one of the block's
 * INNER elements resolves against the block itself.
 *
 * Two rules written side by side in one `@container` block, meant to
 * switch together, then switch at two different widths. The failure is
 * invisible in the common case (a block that fills its parent makes the
 * two widths nearly equal) and appears only when the block is narrower
 * than what measures it — a card in a grid, a banner with a max-width —
 * which is exactly the case nobody tries first.
 *
 * The rule is therefore: in a CONTAINER block's own stylesheet, an
 * `@container` query may target the root element and nothing else. If an
 * inner element has to change with the available width, the block folds
 * with `flex-wrap` (what Card and Banner do) or the query is written
 * against the root and inherited down.
 *
 * Non-container blocks are unaffected: they declare no `container-type`,
 * so every selector in their stylesheet resolves against the same
 * ancestor.
 */
function containerQueryBodies(source: string): string[] {
  const bodies: string[] = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const AT_CONTAINER = /@container[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = AT_CONTAINER.exec(withoutComments))) {
    // Brace-counting from the query's own opening brace: the body holds
    // whole rules, so stopping at the first `}` would read one rule and
    // silently ignore every rule after it — the shape of check that
    // passes because it looked at almost nothing.
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < withoutComments.length && depth > 0; i += 1) {
      if (withoutComments[i] === '{') depth += 1;
      else if (withoutComments[i] === '}') depth -= 1;
    }
    bodies.push(withoutComments.slice(match.index + match[0].length, i - 1));
  }
  return bodies;
}

/** The selectors a rule body declares, one per rule, comma-lists split. */
function selectorsIn(body: string): string[] {
  return [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(
    (rule) => rule[1]?.split(',').map((selector) => selector.trim()) ?? [],
  );
}

describe('a container block only queries its own root', () => {
  const containers = [...pageBlocks, ...headerFooterBlocks].filter(
    (descriptor) => descriptor.isContainer,
  );

  it('finds the container blocks it is meant to be checking', () => {
    expect(containers.length).toBeGreaterThan(0);
  });

  it.each(containers.map((d) => [d.type] as const))(
    '%s puts no inner element inside an @container rule',
    (type) => {
      const source = readFileSync(join(BLOCKS_DIR, `${type}.astro`), 'utf8');
      const blockClass = blockTypeToClassName(type);
      const offenders = containerQueryBodies(source)
        .flatMap(selectorsIn)
        // An inner element is anything after the root: a descendant
        // combinator, a child combinator, or a second class from this
        // block's own namespace (`.kometio-card__media`).
        .filter((selector) => {
          const parts = selector.split(/\s+|>/).filter(Boolean);
          return (
            parts.length > 1 ||
            parts.some((part) => part.includes(`${blockClass}__`))
          );
        });
      expect(offenders).toEqual([]);
    },
  );
});
