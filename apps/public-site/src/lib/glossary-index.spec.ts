import { describe, expect, it } from 'vitest';
import type { Block } from '@kometio/shared-types';
import { glossaryIndex, glossaryInitial } from './glossary-index';

const term = (id: string, text: string): Block => ({
  id,
  type: 'GlossaryTerm',
  props: { term: text, definition: '' },
});

describe('glossaryInitial', () => {
  it('files a term under its first letter without the accent', () => {
    expect(glossaryInitial('Èlite', 'it')).toBe('E');
    expect(glossaryInitial('  zucchero', 'it')).toBe('Z');
  });

  it('files digits and symbols under #', () => {
    expect(glossaryInitial('3D printing', 'en')).toBe('#');
    expect(glossaryInitial('@mention', 'en')).toBe('#');
  });
});

describe('glossaryIndex', () => {
  it('lists each letter once, alphabetically, pointing at its first term in page order', () => {
    const index = glossaryIndex(
      [
        term('b1', 'Banner'),
        term('a1', 'Anchor'),
        term('b2', 'Breadcrumb'),
        term('n1', '404 page'),
        term('e1', 'Èlite'),
      ],
      'it',
    );

    expect(index).toEqual([
      { letter: 'A', anchor: 'glossary-term-a1' },
      { letter: 'B', anchor: 'glossary-term-b1' },
      { letter: 'E', anchor: 'glossary-term-e1' },
      { letter: '#', anchor: 'glossary-term-n1' },
    ]);
  });

  it('skips terms with no words and blocks that are not terms', () => {
    const index = glossaryIndex(
      [
        term('x', '   '),
        { id: 't', type: 'Text', props: { body: 'Apple' } },
        term('c', 'Cookie'),
      ],
      'en',
    );
    expect(index).toEqual([{ letter: 'C', anchor: 'glossary-term-c' }]);
  });
});
