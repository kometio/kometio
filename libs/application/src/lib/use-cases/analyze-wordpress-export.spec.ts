import { describe, expect, it } from 'vitest';
import type {
  WordPressExportChannel,
  WordPressExportItem,
  WordPressExportReaderPort,
} from '@kometio/ports';
import { analyzeWordPressExport } from './analyze-wordpress-export.use-case';

function item(
  overrides: Partial<WordPressExportItem> = {},
): WordPressExportItem {
  return {
    postId: 1,
    postType: 'page',
    status: 'publish',
    title: 'Una pagina',
    slug: 'una-pagina',
    parentId: null,
    menuOrder: 0,
    link: 'https://esempio.test/una-pagina/',
    content: '',
    excerpt: '',
    metaKeys: [],
    metaValues: {},
    terms: [],
    attachmentUrl: '',
    ...overrides,
  };
}

/** Stands in for the WXR file: the use case counts, it does not parse. */
function readerOf(
  items: WordPressExportItem[],
  channel: Partial<WordPressExportChannel> = {},
): WordPressExportReaderPort {
  return {
    async read(_filePath, onItem) {
      for (const one of items) onItem(one);
      return {
        title: 'Il sito',
        baseSiteUrl: 'https://esempio.test',
        baseBlogUrl: 'https://esempio.test',
        terms: [],
        // An export that describes no custom fields — which is what most
        // of these are about. The ones that care pass their own.
        acfSchema: { groups: [], forBlock: () => [], forPostType: () => [] },
        ...channel,
      };
    },
  };
}

function analyze(
  items: WordPressExportItem[],
  channel?: Partial<WordPressExportChannel>,
) {
  return analyzeWordPressExport(
    { exportReader: readerOf(items, channel) },
    { filePath: 'export.xml' },
  );
}

const gutenberg = (...blocks: string[]) =>
  blocks
    .map((name) => `<!-- wp:${name} --><p>x</p><!-- /wp:${name} -->`)
    .join('\n');

describe('analyzeWordPressExport', () => {
  it('counts a page whose blocks all convert as arriving whole', async () => {
    const report = await analyze([
      item({ content: gutenberg('paragraph', 'heading', 'image') }),
    ]);

    expect(report.pages).toEqual({ whole: 1, partial: 0, empty: 0 });
    expect(report.blocks).toMatchObject({
      total: 3,
      native: 3,
      dropped: 0,
      quarantined: [],
    });
  });

  it('counts a page with one unmappable block as arriving in part', async () => {
    // Not as whole. A page that loses its hero has lost the thing the
    // visitor sees first, and saying "imported" about it is the lie this
    // report exists to refuse.
    const report = await analyze([
      item({ content: gutenberg('paragraph', 'acf/hero') }),
    ]);

    expect(report.pages).toEqual({ whole: 0, partial: 1, empty: 0 });
    expect(report.blocks.quarantined).toEqual([{ name: 'acf/hero', count: 1 }]);
  });

  it('treats any block nobody has mapped as quarantine, not as convertible', async () => {
    // The default has to be pessimistic: the table names what is known to
    // work, and a plugin block is by definition not in it.
    const report = await analyze([
      item({ content: gutenberg('some-plugin/whatever') }),
    ]);

    expect(report.blocks.native).toBe(0);
    expect(report.blocks.quarantined).toEqual([
      { name: 'some-plugin/whatever', count: 1 },
    ]);
  });

  it('counts a block that carries nothing as dropped, never as lost', async () => {
    const report = await analyze([
      item({ content: gutenberg('paragraph', 'spacer', 'separator') }),
    ]);

    expect(report.blocks).toMatchObject({ total: 3, native: 1, dropped: 2 });
    // Dropping a spacer does not make the page partial: nothing was lost.
    expect(report.pages.whole).toBe(1);
  });

  it('reads a classic page with no block delimiters as convertible', async () => {
    // Everything written before Gutenberg, which is most of the web. It
    // is HTML, and HTML converts — counting it as zero blocks would have
    // reported the page as empty.
    const report = await analyze([
      item({ content: '<h2>Chi siamo</h2><p>Siamo qui dal 1999.</p>' }),
    ]);

    expect(report.blocks).toMatchObject({ total: 1, native: 1 });
    expect(report.pages).toEqual({ whole: 1, partial: 0, empty: 0 });
  });

  it('names the pages whose body is empty in the export', async () => {
    // The case that started this: on one real site half the pages keep
    // everything in ACF fields, so the export carries a title and
    // nothing else. A count alone is a number; the titles are something
    // to act on.
    const report = await analyze([
      item({ title: 'Home', content: '' }),
      item({ title: 'Contatti', content: '   ' }),
      item({ title: 'Chi siamo', content: gutenberg('paragraph') }),
    ]);

    expect(report.pages).toEqual({ whole: 1, partial: 0, empty: 2 });
    const warning = report.warnings.find(
      (one) => one.kind === 'content-outside-the-post',
    );
    expect(warning).toMatchObject({ count: 2, detail: ['Home', 'Contatti'] });
  });

  it('counts everything that is not a page or a post, by type', async () => {
    // On the largest site measured this was 28 178 entries against 29
    // pages. It is the number that decides whether an import is worth
    // doing at all.
    const report = await analyze([
      item({ postType: 'page' }),
      ...Array.from({ length: 3 }, () => item({ postType: 'product' })),
      item({ postType: 'acme_prodotto' }),
      item({ postType: 'attachment' }),
      item({ postType: 'nav_menu_item' }),
    ]);

    expect(report.found).toMatchObject({
      pages: 1,
      posts: 0,
      attachments: 1,
      menuItems: 1,
      otherTypes: [
        { type: 'product', count: 3 },
        { type: 'acme_prodotto', count: 1 },
      ],
    });
    expect(
      report.warnings.find((one) => one.kind === 'unsupported-post-types'),
    ).toMatchObject({ count: 4 });
  });

  it('says which page builder holds the layout, and on how many pages', async () => {
    const report = await analyze([
      item({ metaKeys: ['_elementor_data'] }),
      item({ metaKeys: ['_elementor_data', '_thumbnail_id'] }),
      item({ metaKeys: ['_thumbnail_id'] }),
    ]);

    expect(report.warnings.find((one) => one.kind === 'page-builder')).toEqual({
      kind: 'page-builder',
      count: 2,
      detail: ['Elementor'],
    });
  });

  it('notices a multilingual site from its plugin bookkeeping', async () => {
    const report = await analyze([
      item({ metaKeys: ['_icl_lang_duplicate_of'] }),
    ]);

    expect(
      report.warnings.find((one) => one.kind === 'multilingual'),
    ).toMatchObject({ detail: ['WPML'] });
  });

  it("counts the taxonomies its pages actually use, not the file's whole list", async () => {
    // One real export declares 36 taxonomies, 35 of them WooCommerce
    // product attributes with up to 659 terms — none of which apply to a
    // page, and all of which would bury the one that does.
    const report = await analyze(
      [
        item({
          terms: [
            { taxonomy: 'category', slug: 'caffe', name: 'Caffè' },
            { taxonomy: 'translation_priority', slug: 'x', name: 'X' },
          ],
        }),
      ],
      {
        terms: [
          { taxonomy: 'pa_misura', slug: 'l', name: 'L', parentSlug: '' },
        ],
      },
    );

    expect(report.terms).toEqual([{ taxonomy: 'category', count: 1 }]);
  });

  it('leaves out what WordPress keeps only for itself', async () => {
    const report = await analyze([
      item({ status: 'auto-draft', content: gutenberg('acf/hero') }),
      item({ status: 'trash', content: gutenberg('acf/hero') }),
    ]);

    expect(report.pages).toEqual({ whole: 0, partial: 0, empty: 0 });
    expect(report.blocks.total).toBe(0);
  });

  it('notices Polylang from its language taxonomy, not only from meta', async () => {
    // Polylang stores the language as a taxonomy term rather than as
    // postmeta, so the meta sweep alone would miss a whole family of
    // multilingual sites.
    const report = await analyze([
      item({ terms: [{ taxonomy: 'language', slug: 'it', name: 'Italiano' }] }),
    ]);

    expect(report.warnings).toContainEqual({
      kind: 'multilingual',
      count: 1,
      detail: ['Polylang'],
    });
  });

  it('ignores the drafts WordPress opened and nobody wrote', async () => {
    // An auto-draft is an empty row WordPress creates when the editor is
    // opened; counting it would raise a warning about nothing.
    const report = await analyze([
      item({ status: 'auto-draft', content: '' }),
      item({ status: 'trash', content: '' }),
      item({ content: gutenberg('paragraph') }),
    ]);

    expect(report.pages).toEqual({ whole: 1, partial: 0, empty: 0 });
    expect(
      report.warnings.find((w) => w.kind === 'content-outside-the-post'),
    ).toBeUndefined();
  });

  it('does not call a block quarantine when the export describes its fields', async () => {
    // The point of reading a site's own field definitions: a block with
    // no Kometio equivalent is not lost if the export says what is inside
    // it. On the first client site this moved 46 blocks out of
    // quarantine and produced 176 real ones from them.
    const report = await analyze(
      [item({ content: gutenberg('paragraph', 'acf/hero') })],
      {
        acfSchema: {
          groups: [],
          forPostType: () => [],
          forBlock: (name) =>
            name === 'acf/hero'
              ? [
                  {
                    key: 'field_1',
                    name: 'title',
                    label: 'Title',
                    type: 'text',
                    children: [],
                  },
                ]
              : [],
        },
      },
    );

    expect(report.blocks.fromFields).toBe(1);
    expect(report.blocks.quarantined).toEqual([]);
    // And the page arrives whole, because nothing on it is lost.
    expect(report.pages).toEqual({ whole: 1, partial: 0, empty: 0 });
  });

  it('says which blocks keep their fields in the theme code instead', async () => {
    // Registering fields in PHP rather than in the database is common,
    // and then only the values travel — worth saying out loud, because
    // it is why those blocks come out plainer than the rest.
    const report = await analyze([
      item({ content: gutenberg('acf/quote', 'acf/quote', 'acf/video') }),
    ]);

    expect(report.blocks.fromFields).toBe(0);
    expect(
      report.warnings.find((w) => w.kind === 'fields-not-described'),
    ).toEqual({
      kind: 'fields-not-described',
      count: 3,
      detail: ['acf/quote (2)', 'acf/video (1)'],
    });
  });

  it('recovers a block from its values when the export describes nothing', async () => {
    // Four of the first client site's nine block types register their
    // fields in the theme's PHP — a fifth of every instance. Without
    // reading the values themselves their words would simply be gone.
    const report = await analyze([
      item({
        content:
          '<!-- wp:acf/quote {"data":{"quote":"Una frase vera","_quote":"field_1","autore":""}} /-->',
      }),
    ]);

    expect(report.blocks.fromFields).toBe(1);
    expect(report.blocks.fromFieldsByBlock).toEqual([
      { name: 'acf/quote', count: 1, knownFrom: 'values' },
    ]);
    expect(report.blocks.quarantined).toEqual([]);
  });

  it('still says the export did not describe it, even once recovered', () => {
    // Two different facts: what converts, and what came out plainer
    // because nobody could say what any of it meant.
    return analyze([
      item({
        content:
          '<!-- wp:acf/quote {"data":{"quote":"Una frase","_quote":"field_1"}} /-->',
      }),
    ]).then((report) => {
      expect(
        report.warnings.find((w) => w.kind === 'fields-not-described'),
      ).toMatchObject({ count: 1, detail: ['acf/quote (1)'] });
    });
  });

  it('leaves a block quarantined when it carries nothing at all', async () => {
    // No definitions, and values that are only settings: there is
    // genuinely nothing to bring across, and saying otherwise would be
    // the lie this whole feature exists to refuse.
    const report = await analyze([
      item({
        content:
          '<!-- wp:acf/spacer {"data":{"height":"40","_height":"field_1"}} /-->',
      }),
    ]);

    expect(report.blocks.fromFields).toBe(0);
    expect(report.blocks.quarantined).toEqual([
      { name: 'acf/spacer', count: 1 },
    ]);
  });

  it('decides from the definitions, not from whichever instance it sampled', async () => {
    // A block whose fields are all settings holds no content, however
    // full the one instance that happened to be read looks.
    const report = await analyze(
      [
        item({
          content:
            '<!-- wp:acf/ultime-notizie {"data":{"posts_count":"3","_posts_count":"field_1"}} /-->',
        }),
      ],
      {
        acfSchema: {
          groups: [],
          forPostType: () => [],
          forBlock: (name) =>
            name === 'acf/ultime-notizie'
              ? [
                  {
                    key: 'field_1',
                    name: 'posts_count',
                    label: 'Quanti',
                    type: 'number',
                    children: [],
                  },
                ]
              : [],
        },
      },
    );

    expect(report.blocks.fromFields).toBe(0);
  });

  it('counts a page as arriving in part only for what stays quarantined', async () => {
    const report = await analyze(
      [item({ content: gutenberg('acf/hero', 'acf/quote') })],
      {
        acfSchema: {
          groups: [],
          forPostType: () => [],
          forBlock: (name) =>
            name === 'acf/hero'
              ? [
                  {
                    key: 'field_1',
                    name: 'title',
                    label: 'Title',
                    type: 'text',
                    children: [],
                  },
                ]
              : [],
        },
      },
    );

    expect(report.blocks).toMatchObject({ fromFields: 1, native: 0 });
    expect(report.blocks.quarantined).toEqual([
      { name: 'acf/quote', count: 1 },
    ]);
    expect(report.pages).toEqual({ whole: 0, partial: 1, empty: 0 });
  });

  it('carries the site name and address out of the file', async () => {
    const report = await analyze([], {
      title: 'Il Sito',
      baseBlogUrl: 'https://esempio.test',
    });

    expect(report.siteTitle).toBe('Il Sito');
    expect(report.sourceUrl).toBe('https://esempio.test');
  });

  it('reports an export with nothing in it without inventing anything', async () => {
    const report = await analyze([]);

    expect(report.pages).toEqual({ whole: 0, partial: 0, empty: 0 });
    expect(report.blocks.total).toBe(0);
    expect(report.warnings).toEqual([]);
  });
});
