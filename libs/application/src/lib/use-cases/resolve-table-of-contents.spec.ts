import { describe, expect, it } from 'vitest';
import type { PageContent } from '@kometio/shared-types';
import { resolveTableOfContents } from './resolve-table-of-contents';

const heading = (id: string, text: string, level: 'h1' | 'h2' | 'h3') => ({
  id,
  type: 'Heading',
  props: { text, level },
});

const toc = (depth: 'h2' | 'h3' = 'h3') => ({
  id: `toc-${depth}`,
  type: 'TableOfContents',
  props: { title: '', depth, numbered: false, entries: [] },
});

describe('resolveTableOfContents', () => {
  it('links every h2 and h3 in document order, headings inside containers included', () => {
    const page: PageContent = [
      toc(),
      heading('a', 'Cosa facciamo', 'h2'),
      {
        id: 'col',
        type: 'Container',
        props: {},
        children: [heading('b', 'Prezzi e piani', 'h3')],
      },
      heading('c', 'Titolo della pagina', 'h1'),
      heading('d', 'Contatti', 'h2'),
    ];

    const [resolved] = resolveTableOfContents([page]);

    expect(resolved[0].props['entries']).toEqual([
      { anchorId: 'cosa-facciamo', text: 'Cosa facciamo', level: 'h2' },
      { anchorId: 'prezzi-e-piani', text: 'Prezzi e piani', level: 'h3' },
      { anchorId: 'contatti', text: 'Contatti', level: 'h2' },
    ]);
    expect(resolved[1].props['anchorId']).toBe('cosa-facciamo');
    expect(resolved[2].children?.[0].props['anchorId']).toBe('prezzi-e-piani');
    // An h1 is the page's own title, not one of its sections.
    expect(resolved[3].props['anchorId']).toBeUndefined();
  });

  it('gives two headings with the same words two different anchors', () => {
    const [resolved] = resolveTableOfContents([
      [toc(), heading('a', 'Dettagli', 'h2'), heading('b', 'Dettagli', 'h2')],
    ]);

    expect(
      (resolved[0].props['entries'] as { anchorId: string }[]).map(
        (entry) => entry.anchorId,
      ),
    ).toEqual(['dettagli', 'dettagli-2']);
  });

  it('never takes an id an Anchor on the page already answers to', () => {
    const [resolved] = resolveTableOfContents([
      [
        toc(),
        { id: 'anchor', type: 'Anchor', props: { name: 'Prezzi' } },
        heading('a', 'Prezzi', 'h2'),
      ],
    ]);

    expect(resolved[2].props['anchorId']).toBe('prezzi-2');
  });

  it('lists only the sections when asked for h2 alone', () => {
    const [resolved] = resolveTableOfContents([
      [toc('h2'), heading('a', 'Uno', 'h2'), heading('b', 'Dentro uno', 'h3')],
    ]);

    expect(resolved[0].props['entries']).toEqual([
      { anchorId: 'uno', text: 'Uno', level: 'h2' },
    ]);
  });

  it('leaves a page with no table of contents exactly as it was', () => {
    const page: PageContent = [heading('a', 'Uno', 'h2')];

    const [resolved] = resolveTableOfContents([page]);

    expect(resolved).toBe(page);
    expect(page[0].props['anchorId']).toBeUndefined();
  });
});
