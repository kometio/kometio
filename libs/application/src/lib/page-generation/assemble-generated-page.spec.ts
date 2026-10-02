import { describe, expect, it } from 'vitest';
import {
  assembleGeneratedPage,
  MAX_GENERATED_BLOCKS,
} from './assemble-generated-page';

const options = { locale: 'en', hasIcon: (name: string) => name === 'rocket' };

function assemble(blocks: unknown[], overrides: Partial<typeof options> = {}) {
  return assembleGeneratedPage({ blocks }, { ...options, ...overrides });
}

const hero = {
  ref: 'hero',
  parent: null,
  type: 'Hero',
  props: { eyebrow: '', title: 'Fresh bread', subtitle: '<p>Every day</p>' },
};

describe('assembleGeneratedPage', () => {
  it('puts the flat answer back together as a tree, with an id on every block', () => {
    const { content, dropped } = assemble([
      hero,
      {
        ref: 'cta',
        parent: 'hero',
        type: 'Button',
        props: { label: 'Order', url: '' },
      },
    ]);

    expect(dropped).toEqual([]);
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      type: 'Hero',
      props: { title: 'Fresh bread' },
    });
    expect(content[0].children?.[0]).toMatchObject({
      type: 'Button',
      // Set by the server, never by the model: no page to link to.
      props: { label: 'Order', linkType: 'url', page: null, icon: null },
    });
    expect(content[0].id).toEqual(expect.any(String));
    expect(content[0].children?.[0].id).toEqual(expect.any(String));
  });

  it('ignores what the model sets that is not its to set', () => {
    const { content } = assemble([
      {
        ref: 'img',
        parent: null,
        type: 'Image',
        props: {
          aspectRatio: 'wide',
          media: { mediaId: 'made-up', url: 'https://example.com/x.jpg' },
        },
      },
    ]);

    // An image is always an empty slot for the person to fill.
    expect(content[0].props).toMatchObject({
      aspectRatio: 'wide',
      media: null,
    });
  });

  it("writes people and prices as placeholders, in the page's language", () => {
    const blocks = [
      { ref: 't', parent: null, type: 'Testimonials', props: {} },
      {
        ref: 't1',
        parent: 't',
        type: 'Testimonial',
        props: { quote: 'Best loaf in town.' },
      },
      { ref: 's', parent: null, type: 'StatsCounter', props: {} },
      {
        ref: 's1',
        parent: 's',
        type: 'Stat',
        props: { prefix: '', suffix: '+', label: 'loaves a day' },
      },
    ];

    const italian = assemble(blocks, { locale: 'it-IT' });
    expect(italian.content[0].children?.[0].props).toMatchObject({
      quote: 'Best loaf in town.',
      author: '[Nome del cliente]',
      role: '[Ruolo]',
      avatar: null,
    });
    expect(italian.content[1].children?.[0].props).toMatchObject({ value: 0 });
    expect(italian.placeholderCount).toBe(2);

    // Any other language gets the English ones.
    const german = assemble(blocks, { locale: 'de' });
    expect(german.content[0].children?.[0].props).toMatchObject({
      author: '[Customer name]',
    });
  });

  it('keeps an icon the theme draws and drops one it does not', () => {
    const { content } = assemble([
      { ref: 'g', parent: null, type: 'FeatureGrid', props: {} },
      {
        ref: 'a',
        parent: 'g',
        type: 'Feature',
        props: { icon: 'rocket', title: 'Fast', text: 'Very.' },
      },
      {
        ref: 'b',
        parent: 'g',
        type: 'Feature',
        props: { icon: 'no-such-icon', title: 'Safe', text: 'Quite.' },
      },
    ]);

    expect(content[0].children?.map((block) => block.props['icon'])).toEqual([
      'rocket',
      null,
    ]);
  });

  it('drops a block whose parent is missing, and everything a dropped block held', () => {
    const { content, dropped } = assemble([
      // Before its parent: parents must come first.
      { ref: 'early', parent: 'list', type: 'ListItem', props: { text: 'x' } },
      { ref: 'list', parent: null, type: 'List', props: { marker: 'nope' } },
      { ref: 'orphan', parent: 'list', type: 'ListItem', props: { text: 'y' } },
      {
        ref: 'lost',
        parent: 'nowhere',
        type: 'Text',
        props: { body: '<p>z</p>' },
      },
      hero,
    ]);

    expect(content.map((block) => block.type)).toEqual(['Hero']);
    expect(dropped).toEqual([
      { ref: 'early', type: 'ListItem', reason: 'unknown-parent' },
      { ref: 'list', type: 'List', reason: 'invalid-props' },
      { ref: 'orphan', type: 'ListItem', reason: 'parent-dropped' },
      { ref: 'lost', type: 'Text', reason: 'unknown-parent' },
    ]);
  });

  it('drops a block where its kind cannot stand', () => {
    const { content, dropped } = assemble([
      {
        ref: 'f',
        parent: null,
        type: 'Feature',
        props: { title: 'a', text: 'b' },
      },
      { ref: 'cols', parent: null, type: 'Columns', props: {} },
      { ref: 'li', parent: 'cols', type: 'ListItem', props: { text: 'x' } },
    ]);

    expect(content.map((block) => block.type)).toEqual(['Columns']);
    expect(dropped.map((entry) => entry.reason)).toEqual([
      'not-allowed-here',
      'not-allowed-here',
    ]);
  });

  it('drops a type outside the catalogue, a reused ref, and anything past the limit', () => {
    const unknown = assemble([
      { ref: 'f', parent: null, type: 'Form', props: {} },
      { ref: 'x', type: 'SiteMap' },
      'not even an object',
    ]);
    expect(unknown.dropped.map((entry) => entry.reason)).toEqual([
      'unknown-type',
      'unknown-type',
      'unknown-type',
    ]);

    const twice = assemble([hero, hero]);
    expect(twice.content).toHaveLength(1);
    expect(twice.dropped).toEqual([
      { ref: 'hero', type: 'Hero', reason: 'duplicate-ref' },
    ]);

    const many = assemble(
      Array.from({ length: MAX_GENERATED_BLOCKS + 2 }, (_, index) => ({
        ref: `d${index}`,
        parent: null,
        type: 'Divider',
        props: {},
      })),
    );
    expect(many.content).toHaveLength(MAX_GENERATED_BLOCKS);
    expect(many.dropped.map((entry) => entry.reason)).toEqual([
      'too-many-blocks',
      'too-many-blocks',
    ]);
  });

  it('keeps a valid List with its points, whatever marker it asks for', () => {
    for (const marker of ['bullet', 'number', 'check', 'icon']) {
      const { content, dropped } = assemble([
        { ref: 'list', parent: null, type: 'List', props: { marker } },
        { ref: 'a', parent: 'list', type: 'ListItem', props: { text: 'Uno' } },
        { ref: 'b', parent: 'list', type: 'ListItem', props: { text: 'Due' } },
      ]);

      expect(dropped, marker).toEqual([]);
      expect(content[0]).toMatchObject({ type: 'List', props: { marker } });
      expect(content[0].children?.map((item) => item.props['text'])).toEqual([
        'Uno',
        'Due',
      ]);
    }
  });

  it('keeps a link that leads somewhere and empties one that would run', () => {
    const { content } = assemble([
      hero,
      {
        ref: 'safe',
        parent: 'hero',
        type: 'Button',
        props: { label: 'Write to us', url: 'mailto:ciao@example.com' },
      },
      {
        ref: 'unsafe',
        parent: 'hero',
        type: 'Button',
        props: { label: 'Order', url: 'javascript:alert(1)' },
      },
    ]);

    expect(content[0].children?.map((block) => block.props['url'])).toEqual([
      'mailto:ciao@example.com',
      '',
    ]);
  });

  it('reports what it dropped in bounded plain text', () => {
    const { dropped } = assemble([
      {
        ref: `x\n${'y'.repeat(500)}`,
        parent: null,
        type: 'NotABlock',
        props: {},
      },
    ]);

    expect(dropped[0].ref).toHaveLength(100);
    expect(dropped[0].ref).not.toContain('\n');
  });

  it('gives an empty page for an answer that is not a list of blocks', () => {
    expect(assembleGeneratedPage('nonsense', options)).toEqual({
      content: [],
      dropped: [],
      placeholderCount: 0,
    });
  });
});
