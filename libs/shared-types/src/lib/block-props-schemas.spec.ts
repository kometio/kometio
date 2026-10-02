import { describe, expect, it } from 'vitest';
import {
  BLOCK_PROPS_SCHEMAS,
  BLOCK_TYPES,
  isBlockType,
} from './block-props-schemas';

describe('BLOCK_PROPS_SCHEMAS', () => {
  it('lists every core block type once, with a schema', () => {
    expect(BLOCK_TYPES).toHaveLength(116);
    expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
    for (const type of BLOCK_TYPES) {
      expect(typeof BLOCK_PROPS_SCHEMAS[type].safeParse).toBe('function');
    }
  });

  it('tells a core block type from anything else', () => {
    expect(isBlockType('Hero')).toBe(true);
    expect(isBlockType('StatusBadge')).toBe(false); // a theme's own block
    expect(isBlockType('toString')).toBe(false); // not an own key
  });

  // Column was the one type the renderer checked nothing on.
  it('checks a Column too', () => {
    expect(BLOCK_PROPS_SCHEMAS.Column.safeParse({ span: 6 }).success).toBe(
      true,
    );
    expect(BLOCK_PROPS_SCHEMAS.Column.safeParse({ span: 13 }).success).toBe(
      false,
    );
  });
});
