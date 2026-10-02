import { z } from 'zod';
import * as pageGroupSchemas from '../pages/page-groups.schemas';
import * as siteLayoutSectionSchemas from '../site-layout-sections/site-layout-sections.schemas';
import { sanitizedPageContentSchema } from './sanitized-page-content.schema';

const ATTACK = '<p>ciao</p><script>steal()</script>';

/** A body carrying a content tree with one hostile rich text value. */
function bodyWithHostileContent(): Record<string, unknown> {
  return {
    content: [{ id: 'a', type: 'Text', props: { body: ATTACK } }],
    // Enough to satisfy the other keys of every body schema below.
    siteId: '00000000-0000-4000-8000-000000000000',
    parentGroupId: null,
    slug: 'x',
    title: 'x',
    locale: 'it',
    kind: 'header',
  };
}

/**
 * The guard ADR-0046 asks for: "a contract with an unguarded entrance is
 * not one".
 *
 * It does not check a hand-kept list of routes — that list is exactly
 * what goes stale. It walks every schema the API actually exports for
 * these two modules, keeps the ones that accept block content, and
 * requires each of them to strip a script. A new write path built on the
 * raw `pageContentSchema` fails here on the day it is written, naming
 * itself.
 */
function contentAcceptingSchemas(
  module: Record<string, unknown>,
): [string, z.ZodType][] {
  return Object.entries(module).filter(
    (entry): entry is [string, z.ZodType] => {
      const [name, value] = entry;
      if (!name.endsWith('BodySchema') || !(value instanceof z.ZodType)) {
        return false;
      }
      const parsed = value.safeParse(bodyWithHostileContent());
      // Parsing the fixture is not enough: zod drops unknown keys, so a
      // body that has nothing to do with content — renaming a page, say —
      // parses it happily and then throws the content away. What makes a
      // schema an ENTRANCE is that the content survives it.
      return (
        parsed.success &&
        typeof parsed.data === 'object' &&
        parsed.data !== null &&
        'content' in parsed.data
      );
    },
  );
}

describe('every API entrance that accepts block content sanitises it', () => {
  const entrances = [
    ...contentAcceptingSchemas(pageGroupSchemas),
    ...contentAcceptingSchemas(siteLayoutSectionSchemas),
  ];

  // If this drops to zero the test above has stopped testing anything —
  // a rename of the schemas, or a change of convention, would otherwise
  // leave it passing while checking nothing at all.
  it('finds the entrances it is supposed to be guarding', () => {
    expect(entrances.length).toBeGreaterThanOrEqual(4);
  });

  it.each(entrances)('%s strips a script from rich text', (_name, schema) => {
    const parsed = schema.parse(bodyWithHostileContent()) as {
      content?: { props: Record<string, string> }[];
    };
    const body = parsed.content?.[0].props['body'];
    expect(body).toBe('<p>ciao</p>');
    expect(body).not.toContain('steal');
  });
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
