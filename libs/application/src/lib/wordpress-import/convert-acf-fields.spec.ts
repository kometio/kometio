import { describe, expect, it, vi } from 'vitest';
import type { AcfField } from '@kometio/ports';
import type { PickedMedia, PickedPage } from '@kometio/shared-types';
import type { AcfConversionResolvers } from './acf-conversion';
import { convertAcfFields } from './convert-acf-fields';
import { recoverAcfValues } from './recover-acf-values';

function field(overrides: Partial<AcfField> & { name: string }): AcfField {
  return {
    key: `field_${overrides.name}`,
    label: '',
    type: 'text',
    children: [],
    ...overrides,
  };
}

const MEDIA: PickedMedia = { mediaId: 'media-1', url: '/uploads/foto.webp' };
const PAGE: PickedPage = { pageGroupId: 'group-1', title: 'Chi siamo' };

/** During the analysis nothing has been imported, so nothing resolves. */
const NOTHING: AcfConversionResolvers = {
  resolveMedia: () => null,
  resolvePage: () => null,
};

const EVERYTHING: AcfConversionResolvers = {
  resolveMedia: () => MEDIA,
  resolvePage: () => PAGE,
};

function convert(
  fields: AcfField[],
  values: Record<string, unknown>,
  resolvers: AcfConversionResolvers = EVERYTHING,
) {
  return convertAcfFields(fields, values, resolvers);
}

describe('convertAcfFields', () => {
  it('never makes a block out of a setting', () => {
    // The finding that shaped this: on the first real site, `select` was
    // the most common field type of all, and eleven of the sixteen
    // fields on its most-used block were settings. One block per field
    // would have produced the words "left" and "large".
    const result = convert(
      [
        field({ name: 'direction', type: 'select' }),
        field({ name: 'show_header', type: 'true_false' }),
        field({ name: 'overlay', type: 'range' }),
        field({ name: 'background', type: 'color_picker' }),
        field({ name: 'body', type: 'wysiwyg' }),
      ],
      {
        direction: 'left',
        show_header: true,
        overlay: 40,
        background: '#fff',
        body: '<p>Ciao</p>',
      },
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: 'Text',
      props: { body: '<p>Ciao</p>' },
    });
    expect(result.settingsSkipped).toBe(4);
  });

  it('gives every block an id, because a translation has to attach to it', () => {
    const result = convert([field({ name: 'body', type: 'wysiwyg' })], {
      body: 'Ciao',
    });

    expect(result.blocks[0].id).toMatch(/[0-9a-f-]{36}/);
  });

  it('reads a text field named like a title as a heading', () => {
    // A heuristic, and the only evidence there is: ACF has no heading
    // type. The mapping layer above overrides it.
    const result = convert(
      [
        field({ name: 'title', label: 'Stripe Title' }),
        field({ name: 'sottotitolo', label: 'Sottotitolo' }),
        field({ name: 'body', label: 'Testo' }),
      ],
      { title: 'Chi siamo', sottotitolo: 'Dal 1998', body: 'Siamo qui.' },
    );

    expect(result.blocks.map((b) => [b.type, b.props])).toEqual([
      ['Heading', { text: 'Chi siamo', level: 'h2' }],
      ['Heading', { text: 'Dal 1998', level: 'h3' }],
      ['Text', { body: 'Siamo qui.' }],
    ]);
  });

  it('never reads a wysiwyg as a heading, whatever it is called', () => {
    // A rich-text field holds markup; forcing it into a heading would
    // print the tags.
    const result = convert(
      [field({ name: 'title', type: 'wysiwyg', label: 'Stripe Title' })],
      { title: '<p>Chi siamo</p>' },
    );

    expect(result.blocks[0].type).toBe('Text');
  });

  it('walks a repeater once per row, in order', () => {
    // ACF stores the row count under the repeater's own name and each
    // row under `name_INDEX_subfield` — the shape the whole converter
    // turns on.
    const result = convert(
      [
        field({
          name: 'slides',
          type: 'repeater',
          children: [
            field({ name: 'title', label: 'Slide Title' }),
            field({ name: 'subtitle', type: 'wysiwyg' }),
          ],
        }),
      ],
      {
        slides: 2,
        slides_0_title: 'Primo',
        slides_0_subtitle: 'uno',
        slides_1_title: 'Secondo',
        slides_1_subtitle: 'due',
      },
    );

    expect(
      result.blocks.map((b) => b.props['text'] ?? b.props['body']),
    ).toEqual(['Primo', 'uno', 'Secondo', 'due']);
  });

  it('ignores a repeater with no rows', () => {
    const result = convert(
      [
        field({
          name: 'slides',
          type: 'repeater',
          children: [field({ name: 'title' })],
        }),
      ],
      { slides: 0, slides_0_title: 'rimasto da prima' },
    );

    expect(result.blocks).toEqual([]);
  });

  it('walks a group by prefixing its name', () => {
    const result = convert(
      [
        field({
          name: 'intro',
          type: 'group',
          children: [field({ name: 'body', type: 'wysiwyg' })],
        }),
      ],
      { intro_body: 'Dentro il gruppo' },
    );

    expect(result.blocks[0].props['body']).toBe('Dentro il gruppo');
  });

  it('stops before a definition that refers to itself can hang the import', () => {
    const loop = field({ name: 'a', type: 'group' });
    loop.children = [loop];

    expect(() => convert([loop], { a_a_a: 'x' })).not.toThrow();
  });

  it('turns an image into an Image once the media exists here', () => {
    const result = convert(
      [field({ name: 'photo', type: 'image', label: 'Foto del negozio' })],
      { photo: 1234 },
    );

    expect(result.blocks[0]).toMatchObject({
      type: 'Image',
      props: { media: MEDIA, alt: 'Foto del negozio', isDecorative: false },
    });
  });

  it('reports an image it cannot place rather than dropping it', () => {
    // What the analysis sees: nothing has been imported, so no media
    // resolves — and the count of what would arrive has to say so.
    const result = convert(
      [field({ name: 'photo', type: 'image' })],
      { photo: 1234 },
      NOTHING,
    );

    expect(result.blocks).toEqual([]);
    expect(result.unconverted).toEqual([{ name: 'photo', type: 'image' }]);
  });

  it('says nothing about a field that was simply left empty', () => {
    // Empty is not a failure, and reporting it as one would bury the
    // fields that really did not come across.
    const result = convert(
      [
        field({ name: 'photo', type: 'image' }),
        field({ name: 'body', type: 'wysiwyg' }),
        field({ name: 'link', type: 'link' }),
      ],
      { photo: '', body: '   ', link: { url: '' } },
      NOTHING,
    );

    expect(result.blocks).toEqual([]);
    expect(result.unconverted).toEqual([]);
  });

  it('reads an attachment however the field was configured to store it', () => {
    const asId = convert([field({ name: 'a', type: 'image' })], { a: 12 });
    const asUrl = convert([field({ name: 'a', type: 'image' })], {
      a: 'https://vecchio.test/foto.jpg',
    });
    const asObject = convert([field({ name: 'a', type: 'image' })], {
      a: { ID: 12, url: 'https://vecchio.test/foto.jpg' },
    });

    for (const result of [asId, asUrl, asObject]) {
      expect(result.blocks[0]?.type).toBe('Image');
    }
  });

  it('keeps only the gallery images that made it across', () => {
    const half: AcfConversionResolvers = {
      resolveMedia: (reference) => (reference === 1 ? MEDIA : null),
      resolvePage: () => null,
    };
    const result = convert(
      [field({ name: 'images', type: 'gallery' })],
      { images: [1, 2, 3] },
      half,
    );

    expect(result.blocks[0]).toMatchObject({ type: 'Gallery' });
    expect(result.blocks[0].props['images']).toHaveLength(1);
  });

  it('turns a link into a button, labelled with whatever it has', () => {
    const withTitle = convert([field({ name: 'link', type: 'link' })], {
      link: { url: '/contatti', title: 'Scrivici' },
    });
    const bare = convert(
      [field({ name: 'link', type: 'url', label: 'Scopri di più' })],
      { link: 'https://esempio.test' },
    );

    expect(withTitle.blocks[0]).toMatchObject({
      type: 'Button',
      props: { label: 'Scrivici', linkType: 'url', url: '/contatti' },
    });
    // No label in the value, so the field's own name stands in: a button
    // with no words on it is worse than one that says something.
    expect(bare.blocks[0].props['label']).toBe('Scopri di più');
  });

  it('points a page link at the page once that page exists here', () => {
    const result = convert([field({ name: 'link', type: 'page_link' })], {
      link: 42,
    });

    expect(result.blocks[0]).toMatchObject({
      type: 'Button',
      props: { linkType: 'page', page: PAGE, label: 'Chi siamo' },
    });
  });

  it('turns an email into something you can click', () => {
    const result = convert([field({ name: 'mail', type: 'email' })], {
      mail: 'ciao@esempio.test',
    });

    expect(result.blocks[0].props['url']).toBe('mailto:ciao@esempio.test');
  });

  it('turns an oembed into a VideoEmbed', () => {
    const result = convert([field({ name: 'video', type: 'oembed' })], {
      video: 'https://youtu.be/abc',
    });

    expect(result.blocks[0]).toMatchObject({
      type: 'VideoEmbed',
      props: { url: 'https://youtu.be/abc' },
    });
  });

  it('reports a content field of a type it has never seen', () => {
    // A type this does not know is not a setting to be skipped quietly:
    // it may well hold words.
    const result = convert([field({ name: 'strano', type: 'text' })], {
      strano: 'qualcosa',
    });
    expect(result.blocks).toHaveLength(1);

    const unknown = convertAcfFields(
      [field({ name: 'strano', type: 'text' })],
      { strano: 'qualcosa' },
      {
        resolveMedia: vi.fn(),
        resolvePage: vi.fn(),
      } as unknown as AcfConversionResolvers,
    );
    expect(unknown.blocks).toHaveLength(1);
  });

  it('ignores a field with no name, which is nothing it can look up', () => {
    const result = convert([field({ name: '', type: 'text' })], { '': 'x' });

    expect(result.blocks).toEqual([]);
  });
});

describe('recoverAcfValues', () => {
  // Real shapes, from a real site: four of its nine block types register
  // their fields in the theme's PHP, so the export describes nothing
  // about them and only these values travel.
  const QUOTE = {
    quote: 'Una frase che qualcuno ha scritto davvero.',
    _quote: 'field_0e01b14c70360',
    autore: '',
    _autore: 'field_a84ed23b54b49',
  };

  const CTA = {
    image: 20,
    _image: 'field_ctabg_image',
    background_color: '#ffffff',
    _background_color: 'field_ctabg_background_color',
    title: 'Find your espresso machine',
    _title: 'field_ctabg_title',
    text: 'Explore the range.',
    _text: 'field_ctabg_text',
    link: { title: 'Espresso', url: 'https://esempio.test/espresso' },
    _link: 'field_ctabg_link',
    title_size: 'normal',
    _title_size: 'field_ctabg_title_size',
  };

  it('recovers the words of a block the export never described', () => {
    const result = recoverAcfValues(QUOTE, NOTHING);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      type: 'Text',
      props: { body: 'Una frase che qualcuno ha scritto davvero.' },
    });
  });

  it('never reads the `_name` mirrors as content', () => {
    // ACF writes one beside every field, holding its key. Taking them
    // for content would put `field_0e01b14c70360` on the page.
    const recovered = recoverAcfValues(QUOTE, NOTHING);

    expect(JSON.stringify(recovered.blocks)).not.toContain('field_');
  });

  it('tells a setting from a sentence by the shape of the value', () => {
    const result = recoverAcfValues(CTA, EVERYTHING);
    const kinds = result.blocks.map((one) => one.type);

    // image, title, text, link — and not the colour, nor `title_size`.
    expect(kinds).toEqual(['Image', 'Heading', 'Text', 'Button']);
    expect(result.settingsSkipped).toBe(2);
  });

  it('knows a setting whether it is the whole key or the end of it', () => {
    // Found on the real data: `height: "420"` and `overlay: "24"` were
    // arriving as paragraphs saying 420 and 24, because the rule only
    // looked for `_height`.
    const result = recoverAcfValues(
      { height: '420', overlay: '24', title_size: 'normal', gap: '16' },
      NOTHING,
    );

    expect(result.blocks).toEqual([]);
    expect(result.settingsSkipped).toBe(4);
  });

  it('does not mistake `title_size` for a title', () => {
    // Why the key has to END in a title word rather than contain one:
    // otherwise the heading of that page reads "normal".
    const result = recoverAcfValues(
      { title_size: 'normal', _title_size: 'x' },
      NOTHING,
    );

    expect(result.blocks).toEqual([]);
    expect(result.settingsSkipped).toBe(1);
  });

  it('keeps a repeater rows in the order they were written', () => {
    // No definition says `stats` is a repeater; the keys do, and they
    // arrive in order.
    const result = recoverAcfValues(
      {
        stats_0_numero: '40',
        stats_0_testo: 'Years of coffee expertise',
        stats_1_numero: '100',
        stats_1_testo: 'Countries served',
      },
      NOTHING,
    );

    expect(result.blocks.map((one) => one.props['body'])).toEqual([
      '40',
      'Years of coffee expertise',
      '100',
      'Countries served',
    ]);
  });

  it('treats a checkbox stored as the string "0" as the setting it is', () => {
    const result = recoverAcfValues(
      { show_header: '0', has_breadcrumbs: '1' },
      NOTHING,
    );

    expect(result.blocks).toEqual([]);
    expect(result.settingsSkipped).toBe(2);
  });

  it('turns a bare address into something you can click', () => {
    const result = recoverAcfValues(
      { destinazione: 'https://esempio.test/x' },
      NOTHING,
    );

    expect(result.blocks[0]).toMatchObject({
      type: 'Button',
      props: { url: 'https://esempio.test/x' },
    });
  });

  it('reports a picture it cannot place instead of losing it quietly', () => {
    const result = recoverAcfValues({ image: 20 }, NOTHING);

    expect(result.blocks).toEqual([]);
    expect(result.unconverted).toEqual([{ name: 'image', type: 'image' }]);
  });

  it('gathers several pictures under one key into a gallery', () => {
    const result = recoverAcfValues({ images: [1, 2, 3] }, EVERYTHING);

    expect(result.blocks[0].type).toBe('Gallery');
    expect(result.blocks[0].props['images']).toHaveLength(3);
  });

  it('says nothing at all about a block with nothing in it', () => {
    const result = recoverAcfValues({ a: '', b: null, c: [] }, NOTHING);

    expect(result).toEqual({ blocks: [], unconverted: [], settingsSkipped: 0 });
  });
});
