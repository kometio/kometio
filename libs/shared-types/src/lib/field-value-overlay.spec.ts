import { describe, expect, it } from 'vitest';
import { mergeTranslatedContent, relinkedOverlay } from './field-value-overlay';
import type { PageContent } from './content-model';

describe('mergeTranslatedContent', () => {
  it('overlays only the fields present in the overlay for a matching block id', () => {
    const groupContent: PageContent = [
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo', subtitle: 'Sottotitolo' },
      },
    ];

    const merged = mergeTranslatedContent(groupContent, {
      'hero-1': { title: 'Title' },
    });

    expect(merged).toEqual([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Title', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  it('falls back to the shared value for a field with no override', () => {
    const groupContent: PageContent = [
      { id: 'text-1', type: 'Text', props: { body: 'Testo condiviso' } },
    ];

    const merged = mergeTranslatedContent(groupContent, {});

    expect(merged).toEqual(groupContent);
  });

  it('recurses into children, overlaying each nested block independently', () => {
    const groupContent: PageContent = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [
          { id: 'text-1', type: 'Text', props: { body: 'Uno' } },
          { id: 'text-2', type: 'Text', props: { body: 'Due' } },
        ],
      },
    ];

    const merged = mergeTranslatedContent(groupContent, {
      'text-2': { body: 'Two' },
    });

    expect(merged).toEqual([
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [
          { id: 'text-1', type: 'Text', props: { body: 'Uno' } },
          { id: 'text-2', type: 'Text', props: { body: 'Two' } },
        ],
      },
    ]);
  });

  it('never overrides a block with no id, even if the overlay somehow keys on undefined', () => {
    const groupContent: PageContent = [
      { type: 'Text', props: { body: 'Senza id' } },
    ];

    const merged = mergeTranslatedContent(groupContent, {
      undefined: { body: 'Should never apply' },
    } as unknown as Record<string, Record<string, string>>);

    expect(merged).toEqual(groupContent);
  });

  it('leaves styleOverride and every other block field untouched', () => {
    const groupContent: PageContent = [
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo' },
        styleOverride: { base: { borderRadius: '4px' } },
      },
    ];

    const merged = mergeTranslatedContent(groupContent, {
      'hero-1': { title: 'Title' },
    });

    expect(merged[0].styleOverride).toEqual({ base: { borderRadius: '4px' } });
  });
});

describe('relinkedOverlay', () => {
  const shared: PageContent = [
    { id: 'hero', type: 'Hero', props: { title: 'Welcome', image: 'a.png' } },
    {
      id: 'cols',
      type: 'Columns',
      props: {},
      children: [{ id: 'text', type: 'Text', props: { body: '<p>Hello</p>' } }],
    },
  ];
  const translatable = (type: string) =>
    type === 'Hero' ? ['title'] : type === 'Text' ? ['body'] : [];

  /*
   * The whole point of relinking this way: the translation that was done
   * on the fork is not thrown away where it still has a block to go to.
   */
  it('keeps the text of every block the shared structure still has', () => {
    const fork: PageContent = [
      {
        id: 'hero',
        type: 'Hero',
        props: { title: 'Benvenuti', image: 'b.png' },
      },
      {
        id: 'cols',
        type: 'Columns',
        props: {},
        children: [
          { id: 'text', type: 'Text', props: { body: '<p>Ciao</p>' } },
        ],
      },
    ];

    expect(relinkedOverlay(shared, fork, translatable)).toEqual({
      fieldValues: {
        hero: { title: 'Benvenuti' },
        text: { body: '<p>Ciao</p>' },
      },
      lostBlockCount: 0,
    });
  });

  it('never turns a non-translatable prop into text', () => {
    const fork: PageContent = [
      { id: 'hero', type: 'Hero', props: { title: 'Welcome', image: 'b.png' } },
    ];

    expect(relinkedOverlay(shared, fork, translatable).fieldValues).toEqual({});
  });

  it('counts what only the fork has — the part relinking gives up', () => {
    const fork: PageContent = [
      { id: 'hero', type: 'Hero', props: { title: 'Benvenuti' } },
      { id: 'extra', type: 'Text', props: { body: '<p>Solo qui</p>' } },
      { id: 'text', type: 'Heading', props: { text: 'Stesso id, altro tipo' } },
    ];

    expect(relinkedOverlay(shared, fork, translatable).lostBlockCount).toBe(2);
  });

  it('finds a block the fork moved, by its id', () => {
    const fork: PageContent = [
      { id: 'text', type: 'Text', props: { body: '<p>Spostato</p>' } },
    ];

    expect(relinkedOverlay(shared, fork, translatable).fieldValues).toEqual({
      text: { body: '<p>Spostato</p>' },
    });
  });
});
