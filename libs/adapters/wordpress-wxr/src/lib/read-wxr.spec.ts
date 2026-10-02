import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readWxr, type WxrItem } from './read-wxr';

/**
 * Hand-written, and small on purpose. The exports this was built against
 * are real client sites and stay off this repo; what they are for is
 * measuring, and what a fixture is for is pinning down one behaviour at a
 * time.
 */
function wxr(body: string): Readable {
  return Readable.from([
    `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Il sito</title>
  <wp:base_site_url>https://esempio.test</wp:base_site_url>
  <wp:base_blog_url>https://esempio.test</wp:base_blog_url>
${body}
</channel>
</rss>`,
  ]);
}

async function itemsOf(
  body: string,
  keepMetaValues?: readonly string[],
): Promise<WxrItem[]> {
  const items: WxrItem[] = [];
  await readWxr(wxr(body), (item) => items.push(item), { keepMetaValues });
  return items;
}

const PAGE = `  <item>
    <title><![CDATA[Chi siamo]]></title>
    <link>https://esempio.test/chi-siamo/</link>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Ciao</p><!-- /wp:paragraph -->]]></content:encoded>
    <excerpt:encoded><![CDATA[Un riassunto]]></excerpt:encoded>
    <wp:post_id>12</wp:post_id>
    <wp:post_type><![CDATA[page]]></wp:post_type>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_name><![CDATA[chi-siamo]]></wp:post_name>
    <wp:post_parent>3</wp:post_parent>
    <wp:menu_order>5</wp:menu_order>
  </item>`;

describe('readWxr', () => {
  it('reads a page with everything the importer needs to place it', async () => {
    const [item] = await itemsOf(PAGE);

    expect(item).toMatchObject({
      postId: 12,
      postType: 'page',
      status: 'publish',
      title: 'Chi siamo',
      slug: 'chi-siamo',
      parentId: 3,
      menuOrder: 5,
      link: 'https://esempio.test/chi-siamo/',
      excerpt: 'Un riassunto',
    });
    expect(item.content).toBe(
      '<!-- wp:paragraph --><p>Ciao</p><!-- /wp:paragraph -->',
    );
  });

  it('reads the channel around the items', async () => {
    const channel = await readWxr(wxr(PAGE), () => undefined);

    expect(channel.title).toBe('Il sito');
    expect(channel.baseBlogUrl).toBe('https://esempio.test');
  });

  it('does not let an item title overwrite the site title', async () => {
    // Both are `<title>`; only the depth tells them apart.
    const channel = await readWxr(wxr(PAGE), () => undefined);

    expect(channel.title).toBe('Il sito');
  });

  it('keeps the body exactly as WordPress stored it', async () => {
    // A post body is content, not a field to tidy: leading whitespace
    // inside a `<pre>` is part of what somebody wrote.
    const [item] = await itemsOf(`  <item>
    <wp:post_type>post</wp:post_type>
    <content:encoded><![CDATA[<pre>  due spazi
e una riga
</pre>]]></content:encoded>
  </item>`);

    expect(item.content).toBe('<pre>  due spazi\ne una riga\n</pre>');
  });

  it('reads a body that arrives in several chunks', async () => {
    // A long `content:encoded` never arrives whole from a stream, which
    // is the one thing a reader written against a small fixture gets
    // wrong.
    const long = 'x'.repeat(200_000);
    const items: WxrItem[] = [];
    const source = Readable.from(
      [
        '<?xml version="1.0"?><rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><wp:post_type>page</wp:post_type><content:encoded><![CDATA[',
        ...Array.from({ length: 20 }, () => long.slice(0, 10_000)),
        ']]></content:encoded></item></channel></rss>',
      ].map((part) => Buffer.from(part)),
    );
    await readWxr(source, (item) => items.push(item));

    expect(items[0].content).toHaveLength(200_000);
  });

  it('collects postmeta keys and keeps only the values it was asked for', async () => {
    // Values are most of an export's weight — 66 MB of 90 MB on the
    // largest site measured.
    const [item] = await itemsOf(
      `  <item>
    <wp:post_type>page</wp:post_type>
    <wp:postmeta><wp:meta_key><![CDATA[_elementor_data]]></wp:meta_key><wp:meta_value><![CDATA[[{"enorme":true}]]]></wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key><wp:meta_value><![CDATA[99]]></wp:meta_value></wp:postmeta>
  </item>`,
      ['_thumbnail_id'],
    );

    expect(item.metaKeys).toEqual(['_elementor_data', '_thumbnail_id']);
    expect(item.metaValues).toEqual({ _thumbnail_id: '99' });
  });

  it('reads the terms an item carries, taxonomy and all', async () => {
    const [item] = await itemsOf(`  <item>
    <wp:post_type>post</wp:post_type>
    <category domain="category" nicename="caffe"><![CDATA[Caffè]]></category>
    <category domain="post_tag" nicename="espresso"><![CDATA[Espresso]]></category>
  </item>`);

    expect(item.terms).toEqual([
      { taxonomy: 'category', slug: 'caffe', name: 'Caffè' },
      { taxonomy: 'post_tag', slug: 'espresso', name: 'Espresso' },
    ]);
  });

  it('ignores a category element with no taxonomy or slug', async () => {
    // WordPress writes one for the display name alone on old exports;
    // importing it would invent a term with no address.
    const [item] = await itemsOf(`  <item>
    <wp:post_type>post</wp:post_type>
    <category><![CDATA[Senza dominio]]></category>
  </item>`);

    expect(item.terms).toEqual([]);
  });

  it('reads the header terms with their hierarchy', async () => {
    const channel = await readWxr(
      wxr(`  <wp:term>
    <wp:term_taxonomy><![CDATA[category]]></wp:term_taxonomy>
    <wp:term_slug><![CDATA[macchine]]></wp:term_slug>
    <wp:term_name><![CDATA[Macchine]]></wp:term_name>
    <wp:term_parent><![CDATA[]]></wp:term_parent>
  </wp:term>
  <wp:term>
    <wp:term_taxonomy><![CDATA[category]]></wp:term_taxonomy>
    <wp:term_slug><![CDATA[espresso]]></wp:term_slug>
    <wp:term_name><![CDATA[Espresso]]></wp:term_name>
    <wp:term_parent><![CDATA[macchine]]></wp:term_parent>
  </wp:term>`),
      () => undefined,
    );

    expect(channel.terms).toEqual([
      {
        taxonomy: 'category',
        slug: 'macchine',
        name: 'Macchine',
        parentSlug: '',
      },
      {
        taxonomy: 'category',
        slug: 'espresso',
        name: 'Espresso',
        parentSlug: 'macchine',
      },
    ]);
  });

  it('reads a custom post type as itself, not as something it recognises', async () => {
    // What a site keeps outside pages and posts is the whole point of
    // the analysis: on one real site it was 115 entries out of 143.
    const items =
      await itemsOf(`  <item><wp:post_type><![CDATA[acme_prodotto]]></wp:post_type></item>
  <item><wp:post_type><![CDATA[product]]></wp:post_type></item>`);

    expect(items.map((item) => item.postType)).toEqual([
      'acme_prodotto',
      'product',
    ]);
  });

  it('reads an attachment with the address its file lived at', async () => {
    const [item] = await itemsOf(`  <item>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url><![CDATA[https://esempio.test/wp-content/uploads/foto.jpg]]></wp:attachment_url>
  </item>`);

    expect(item.attachmentUrl).toBe(
      'https://esempio.test/wp-content/uploads/foto.jpg',
    );
  });

  it('gives an item with no id a null rather than a zero', async () => {
    // Zero is a real post id in nobody's export, and `parentId: 0` is how
    // WordPress writes "no parent" — a caller has to be able to tell.
    const [item] = await itemsOf(`  <item>
    <wp:post_type>page</wp:post_type>
    <wp:post_parent>0</wp:post_parent>
  </item>`);

    expect(item.postId).toBeNull();
    expect(item.parentId).toBe(0);
  });

  it('reads an export with no items at all without failing', async () => {
    const items = await itemsOf('');

    expect(items).toEqual([]);
  });
});
