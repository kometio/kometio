import { z } from 'zod';
import * as pageGroupSchemas from '../pages/page-groups.schemas';
import * as reusableSectionSchemas from '../reusable-sections/reusable-sections.schemas';
import * as siteLayoutSectionSchemas from '../site-layout-sections/site-layout-sections.schemas';
import { sanitizedPageContentSchema } from './sanitized-page-content.schema';

const ATTACK = '<p>ciao</p><script>steal()</script>';

/**
 * The kinds the bodies below ask for: a header or footer's, and a reusable
 * section's. One fixture cannot be both, so a schema is tried with each.
 */
const KINDS = ['header', 'shared'];

/** A body carrying a content tree with one hostile rich text value. */
function bodyWithHostileContent(kind: string): Record<string, unknown> {
  return {
    content: [{ id: 'a', type: 'Text', props: { body: ATTACK } }],
    // Enough to satisfy the other keys of every body schema below.
    siteId: '00000000-0000-4000-8000-000000000000',
    parentGroupId: null,
    slug: 'x',
    title: 'x',
    locale: 'it',
    name: 'x',
    kind,
  };
}

/** The body the schema accepts, if it accepts one of the fixtures. */
function acceptedFixture(schema: z.ZodType): Record<string, unknown> | null {
  for (const kind of KINDS) {
    const body = bodyWithHostileContent(kind);
    const parsed = schema.safeParse(body);
    // Parsing the fixture is not enough: zod drops unknown keys, so a
    // body that has nothing to do with content — renaming a page, say —
    // parses it happily and then throws the content away. What makes a
    // schema an ENTRANCE is that the content survives it.
    if (
      parsed.success &&
      typeof parsed.data === 'object' &&
      parsed.data !== null &&
      'content' in parsed.data
    ) {
      return body;
    }
  }
  return null;
}

/**
 * The guard ADR-0046 asks for: "a contract with an unguarded entrance is
 * not one".
 *
 * It does not check a hand-kept list of routes — that list is exactly
 * what goes stale. It walks every schema the API actually exports for
 * these three modules, keeps the ones that accept block content, and
 * requires each of them to strip a script. A new write path built on the
 * raw `pageContentSchema` fails here on the day it is written, naming
 * itself.
 */
function contentAcceptingSchemas(
  module: Record<string, unknown>,
): [string, z.ZodType, Record<string, unknown>][] {
  const found: [string, z.ZodType, Record<string, unknown>][] = [];
  for (const [name, value] of Object.entries(module)) {
    if (!name.endsWith('BodySchema') || !(value instanceof z.ZodType)) continue;
    const body = acceptedFixture(value);
    if (body) found.push([name, value, body]);
  }
  return found;
}

describe('every API entrance that accepts block content sanitises it', () => {
  const entrances = [
    ...contentAcceptingSchemas(pageGroupSchemas),
    ...contentAcceptingSchemas(reusableSectionSchemas),
    ...contentAcceptingSchemas(siteLayoutSectionSchemas),
  ];

  // If this drops to zero the test above has stopped testing anything —
  // a rename of the schemas, or a change of convention, would otherwise
  // leave it passing while checking nothing at all.
  it('finds the entrances it is supposed to be guarding', () => {
    expect(entrances.length).toBeGreaterThanOrEqual(6);
  });

  it.each(entrances)(
    '%s strips a script from rich text',
    (_name, schema, hostile) => {
      const parsed = schema.parse(hostile);
      // Exactly the paragraph, so nothing of the script is left in it.
      expect(parsed).toHaveProperty('content[0].props.body', '<p>ciao</p>');
    },
  );
});

describe('sanitizedPageContentSchema', () => {
  it('leaves a literal field alone, whatever it contains', () => {
    // Code.code stays `textarea` precisely so this stays true: the
    // sanitiser would eat everything after the `<`.
    const [block] = sanitizedPageContentSchema.parse([
      { id: 'a', type: 'Code', props: { code: 'if (a < b) { go(); }' } },
    ]);
    expect(block.props['code']).toBe('if (a < b) { go(); }');
  });

  it('reaches rich text nested inside a container', () => {
    const [container] = sanitizedPageContentSchema.parse([
      {
        id: 'c',
        type: 'Container',
        props: {},
        children: [{ id: 'a', type: 'Text', props: { body: ATTACK } }],
      },
    ]);
    expect(container.children?.[0].props['body']).toBe('<p>ciao</p>');
  });

  it('keeps an internal page reference, which render resolves later', () => {
    const [block] = sanitizedPageContentSchema.parse([
      {
        id: 'a',
        type: 'Text',
        props: { body: '<p><a href="kometio://page/9f3a">x</a></p>' },
      },
    ]);
    expect(block.props['body']).toContain('kometio://page/9f3a');
  });
});
