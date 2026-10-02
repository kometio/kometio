import { describe, expect, it } from 'vitest';
import { BLOCK_PROPS_SCHEMAS } from '@kometio/shared-types';
import { GENERATION_CATALOG, isGenerableType } from './generation-catalog';
import { generatedPageJsonSchema } from './generation-output';

describe('the generation catalogue', () => {
  const entries = Object.entries(GENERATION_CATALOG);

  it("only lets the model write props the block's real schema has", () => {
    for (const [type, spec] of entries) {
      if (!isGenerableType(type)) throw new Error(type);
      const shape = Object.keys(BLOCK_PROPS_SCHEMAS[type].shape);
      for (const key of spec.writes)
        expect(shape, `${type}.${key}`).toContain(key);
    }
  });

  it('only holds blocks it also describes, and every inner block has a place', () => {
    const held = new Set<string>();
    for (const [type, spec] of entries) {
      for (const child of 'children' in spec ? spec.children : []) {
        expect(isGenerableType(child), `${type} > ${child}`).toBe(true);
        held.add(child);
      }
    }
    for (const [type, spec] of entries) {
      if (!spec.root) expect(held.has(type), type).toBe(true);
    }
  });
});

describe('generatedPageJsonSchema', () => {
  const schema = JSON.stringify(generatedPageJsonSchema());

  // Structured output cannot describe a recursive schema.
  it('is not recursive', () => {
    expect(schema).not.toContain('"$ref"');
  });

  it('closes every object, as structured output requires', () => {
    const objects = schema.match(/"type":"object"/g) ?? [];
    const closed = schema.match(/"additionalProperties":false/g) ?? [];
    expect(closed.length).toBe(objects.length);
  });

  it('never offers the model a field the server sets', () => {
    for (const key of [
      '"media"',
      '"avatar"',
      '"photo"',
      '"page"',
      '"linkType"',
    ]) {
      expect(schema, key).not.toContain(key);
    }
  });
});
