import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { auditBlockProps } from './audit-block-props';
import type { PageContent } from './block';

// A Column's span is 1 to 12 (block-props-schemas.spec.ts says so too).
const column = (id: string, span: number, children?: PageContent) => ({
  id,
  type: 'Column',
  props: { span },
  ...(children ? { children } : {}),
});

describe('auditBlockProps', () => {
  it('has nothing to say about content whose blocks all pass', () => {
    expect(auditBlockProps([column('a', 6), column('b', 12)])).toEqual({
      checked: 2,
      unchecked: new Map(),
      invalid: [],
    });
  });

  it("names the block whose props its type's schema refuses, and why", () => {
    const audit = auditBlockProps([column('a', 6), column('b', 13)]);

    expect(audit.checked).toBe(2);
    expect(audit.invalid).toEqual([
      {
        id: 'b',
        type: 'Column',
        position: 2,
        issues: [expect.stringMatching(/^span: /)],
        fields: ['span'],
      },
    ]);
  });

  // Container → children → page order: the second block of a tree whose
  // first block has two children is the first child, not the next root.
  it('names the props at fault by key, once each, whatever the depth of the issue', () => {
    const audit = auditBlockProps(
      [
        {
          id: 'x',
          type: 'Probe',
          props: { media: null, tags: [1, 2], caption: 'ok' },
        },
      ],
      {
        Probe: z.object({
          media: z.object({ id: z.string() }),
          tags: z.array(z.string()),
          caption: z.string(),
        }),
      },
    );

    // `tags` has two issues (0 and 1) and is named once.
    expect(audit.invalid[0].issues).toHaveLength(3);
    expect(audit.invalid[0].fields).toEqual(['media', 'tags']);
  });

  it('reaches blocks at any depth, and counts them in page order', () => {
    const audit = auditBlockProps([
      column('root', 6, [column('first', 6), column('second', 99)]),
      column('last', 6),
    ]);

    expect(audit.checked).toBe(4);
    expect(audit.invalid.map(({ id, position }) => [id, position])).toEqual([
      ['second', 3],
    ]);
  });

  it('reports a block with no id by where it is', () => {
    const audit = auditBlockProps([
      { type: 'Column', props: { span: 6 } },
      { type: 'Column', props: { span: 0 } },
    ]);

    expect(audit.invalid).toEqual([
      expect.objectContaining({ id: undefined, position: 2 }),
    ]);
  });

  // A theme's own block has its schema in the theme: not here. It is a gap in
  // the audit, said with its type, and not a failure of the block.
  it('counts a type it has no schema for instead of failing it', () => {
    const audit = auditBlockProps([
      { id: 'x', type: 'StatusBadge', props: { whatever: 1 } },
      { id: 'y', type: 'StatusBadge', props: {} },
      { id: 'z', type: 'toString', props: {} }, // a name of Object, not a schema
      { id: 'w', type: '__proto__', props: {} },
    ]);

    expect(audit).toEqual({
      checked: 0,
      unchecked: new Map([
        ['StatusBadge', 2],
        ['toString', 1],
        ['__proto__', 1],
      ]),
      invalid: [],
    });
  });

  it("holds a block to the schemas it is given when they are not the core's", () => {
    const audit = auditBlockProps(
      [{ id: 'x', type: 'StatusBadge', props: { tone: 'purple' } }],
      { StatusBadge: z.object({ tone: z.enum(['info', 'warn']) }) },
    );

    expect(audit.checked).toBe(1);
    expect(audit.invalid).toEqual([
      expect.objectContaining({ id: 'x', issues: [expect.any(String)] }),
    ]);
  });
});
