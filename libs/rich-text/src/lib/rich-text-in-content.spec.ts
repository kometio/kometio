import { describe, expect, it } from 'vitest';
import type { Block, FieldValueOverlay } from '@kometio/shared-types';
import {
  blockTypesById,
  transformRichTextInContent,
  transformRichTextInOverlay,
} from './rich-text-in-content';

const upper = (v: string) => v.toUpperCase();
/** Stands in for a registry: Text.body is rich text, Code.code is not. */
const isRichText = (type: string, key: string) =>
  type === 'Text' && key === 'body';

describe('transformRichTextInContent', () => {
  it('transforms a rich text prop and leaves every other prop alone', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'Text', props: { body: 'ciao', title: 'ciao' } },
    ];
    expect(
      transformRichTextInContent(blocks, isRichText, upper)[0].props,
    ).toEqual({ body: 'CIAO', title: 'ciao' });
  });

  it('leaves a literal field untouched, whatever it contains', () => {
    // The reason this matters: Code.code holds real source, and a
    // sanitiser would eat everything after a `<`.
    const blocks: Block[] = [
      { id: 'a', type: 'Code', props: { code: 'if (a < b) {}' } },
    ];
    expect(transformRichTextInContent(blocks, isRichText, upper)).toBe(blocks);
  });

  it('reaches rich text nested inside containers', () => {
    const blocks: Block[] = [
      {
        id: 'c',
        type: 'Container',
        props: {},
        children: [{ id: 'a', type: 'Text', props: { body: 'ciao' } }],
      },
    ];
    const out = transformRichTextInContent(blocks, isRichText, upper);
    expect(out[0].children?.[0].props['body']).toBe('CIAO');
  });

  it('returns the very same array when nothing changed, so callers can skip work', () => {
    const blocks: Block[] = [{ id: 'a', type: 'Text', props: { body: 'X' } }];
    expect(transformRichTextInContent(blocks, isRichText, upper)).toBe(blocks);
  });

  it('does not mutate the tree it was given', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'Text', props: { body: 'ciao' } },
    ];
    transformRichTextInContent(blocks, isRichText, upper);
    expect(blocks[0].props['body']).toBe('ciao');
  });

  it('ignores a non-string value under a rich text key', () => {
    const blocks: Block[] = [{ id: 'a', type: 'Text', props: { body: 42 } }];
    expect(transformRichTextInContent(blocks, isRichText, upper)).toBe(blocks);
  });
});

describe('transformRichTextInOverlay', () => {
  const tree: Block[] = [
    { id: 'text-1', type: 'Text', props: {} },
    { id: 'code-1', type: 'Code', props: {} },
  ];

  it('transforms only the rich text field of the right block', () => {
    const overlay: FieldValueOverlay = {
      'text-1': { body: 'ciao' },
      'code-1': { code: 'if (a < b) {}' },
    };
    const out = transformRichTextInOverlay(
      overlay,
      blockTypesById(tree),
      isRichText,
      upper,
    );
    expect(out['text-1']['body']).toBe('CIAO');
    // Code.code is `translatable` on purpose, so it really does live here.
    expect(out['code-1']['code']).toBe('if (a < b) {}');
  });

  it('leaves a value whose block is no longer in the tree', () => {
    const overlay: FieldValueOverlay = { ghost: { body: 'ciao' } };
    const out = transformRichTextInOverlay(
      overlay,
      blockTypesById(tree),
      isRichText,
      upper,
    );
    expect(out['ghost']['body']).toBe('ciao');
  });
});

describe('blockTypesById', () => {
  it('maps nested blocks too', () => {
    const types = blockTypesById([
      {
        id: 'c',
        type: 'Container',
        props: {},
        children: [{ id: 'a', type: 'Text', props: {} }],
      },
    ]);
    expect(types.get('a')).toBe('Text');
    expect(types.get('c')).toBe('Container');
  });
});
