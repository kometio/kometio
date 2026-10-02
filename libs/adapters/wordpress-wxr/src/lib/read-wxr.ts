import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { Parser } from 'htmlparser2';

/** A term as it is declared on an item (`<category domain nicename>`). */
export interface WxrItemTerm {
  taxonomy: string;
  slug: string;
  name: string;
}

/** A term as it is declared once, in the channel header (`<wp:term>`). */
export interface WxrTerm extends WxrItemTerm {
  /** Empty when the term sits at the top of its taxonomy. */
  parentSlug: string;
}

export interface WxrItem {
  postId: number | null;
  /** `page`, `post`, `attachment`, `nav_menu_item`, or whatever custom type the site defined. */
  postType: string;
  status: string;
  title: string;
  slug: string;
  parentId: number | null;
  menuOrder: number;
  /** The address the content lived at, used to rewrite links that point back at the old site. */
  link: string;
  content: string;
  excerpt: string;
  /**
   * The postmeta keys on this item — keys only.
   *
   * Values are most of an export's weight (66 MB of 90 MB on the largest
   * site measured, over two million rows) and almost all of it is opaque
   * plugin state. What the analysis needs from postmeta is whether a key
   * is *there* — `_elementor_data` means a page builder, `_icl_*` means
   * WPML — and a caller that needs a particular value asks for it by name
   * through `keepMetaValues`.
   */
  metaKeys: string[];
  /** Only the keys the caller asked to keep — see `keepMetaValues`. */
  metaValues: Record<string, string>;
  terms: WxrItemTerm[];
  /** Attachments only: where the file lived. */
  attachmentUrl: string;
}

export interface WxrChannel {
  title: string;
  baseSiteUrl: string;
  baseBlogUrl: string;
  /** Declared once each in the header, with their hierarchy — unlike the per-item `terms`. */
  terms: WxrTerm[];
}

export interface ReadWxrOptions {
  /**
   * Postmeta keys whose value is kept on the item. Everything else keeps
   * only its key — see `WxrItem.metaKeys` for why.
   */
  keepMetaValues?: readonly string[];
}

/** `<wp:post_id>42</wp:post_id>` with anything that is not a number in it. */
function readNumber(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * One field of an item, by tag name.
 *
 * A switch and not a lookup table keyed by field name: the table needed a
 * cast to assign through it, and a cast here would be hiding that `postId`
 * is a number while `title` is a string — which is the one thing worth
 * knowing.
 */
function assignItemField(item: WxrItem, name: string, value: string): void {
  switch (name) {
    case 'title':
      item.title = value.trim();
      return;
    case 'link':
      item.link = value.trim();
      return;
    // The body keeps its whitespace: a WXR stores it verbatim, and
    // leading spaces inside a `<pre>` are part of what somebody wrote.
    case 'content:encoded':
      item.content = value;
      return;
    case 'excerpt:encoded':
      item.excerpt = value;
      return;
    case 'wp:post_id':
      item.postId = readNumber(value);
      return;
    case 'wp:post_type':
      item.postType = value.trim();
      return;
    case 'wp:status':
      item.status = value.trim();
      return;
    case 'wp:post_name':
      item.slug = value.trim();
      return;
    case 'wp:post_parent':
      item.parentId = readNumber(value);
      return;
    case 'wp:menu_order':
      item.menuOrder = readNumber(value) ?? 0;
      return;
    case 'wp:attachment_url':
      item.attachmentUrl = value.trim();
      return;
    default:
      return;
  }
}

function emptyItem(): WxrItem {
  return {
    postId: null,
    postType: '',
    status: '',
    title: '',
    slug: '',
    parentId: null,
    menuOrder: 0,
    link: '',
    content: '',
    excerpt: '',
    metaKeys: [],
    metaValues: {},
    terms: [],
    attachmentUrl: '',
  };
}

/**
 * Reads a WordPress eXtended RSS export, one item at a time.
 *
 * Streaming, and not a convenience: the largest site measured while this
 * was written holds 23 MB of posts and 66 MB of postmeta across two
 * million rows, which is 150 MB of XML once WordPress has wrapped it.
 * Parsing that into a document tree is hundreds of megabytes of heap for
 * a report that only needs counters — so nothing here ever holds more
 * than the item being read.
 *
 * `onItem` is called as each `</item>` closes, and the item is dropped
 * straight afterwards. A caller that wants to keep something keeps it.
 */
export async function readWxr(
  source: string | Readable,
  onItem: (item: WxrItem) => void,
  options: ReadWxrOptions = {},
): Promise<WxrChannel> {
  const keepMetaValues = new Set(options.keepMetaValues ?? []);
  const channel: WxrChannel = {
    title: '',
    baseSiteUrl: '',
    baseBlogUrl: '',
    terms: [],
  };

  // Where we are. A WXR is shallow — channel, then items — so a path of
  // open tags is enough, and cheaper than a general-purpose tree.
  let depth = 0;
  let item: WxrItem | null = null;
  let term: Partial<WxrTerm> | null = null;
  let meta: { key: string; value: string } | null = null;
  let itemTerm: (WxrItemTerm & { open: boolean }) | null = null;
  let text = '';

  const parser = new Parser(
    {
      onopentag(rawName, attributes) {
        const name = rawName.toLowerCase();
        depth += 1;
        text = '';

        if (name === 'item') {
          item = emptyItem();
        } else if (name === 'wp:term') {
          term = { taxonomy: '', slug: '', name: '', parentSlug: '' };
        } else if (name === 'wp:postmeta') {
          meta = { key: '', value: '' };
        } else if (name === 'category' && item) {
          // `<category domain="category" nicename="caffe">Caffè</category>`
          // — the taxonomy and the slug are attributes, the name is the
          // text, and an item may carry the same element for tags too.
          itemTerm = {
            taxonomy: String(attributes['domain'] ?? ''),
            slug: String(attributes['nicename'] ?? ''),
            name: '',
            open: true,
          };
        }
      },

      ontext(chunk) {
        // Text arrives in pieces — a long `content:encoded` comes in many
        // chunks, and CDATA is reported as text in xmlMode.
        text += chunk;
      },

      onclosetag(rawName) {
        const name = rawName.toLowerCase();
        depth -= 1;
        const value = text;
        text = '';

        if (name === 'item') {
          if (item) onItem(item);
          item = null;
          return;
        }

        if (name === 'category' && itemTerm) {
          if (itemTerm.taxonomy !== '' && itemTerm.slug !== '') {
            item?.terms.push({
              taxonomy: itemTerm.taxonomy,
              slug: itemTerm.slug,
              name: value.trim(),
            });
          }
          itemTerm = null;
          return;
        }

        if (meta) {
          if (name === 'wp:meta_key') meta.key = value.trim();
          else if (name === 'wp:meta_value') meta.value = value;
          else if (name === 'wp:postmeta') {
            if (item && meta.key !== '') {
              item.metaKeys.push(meta.key);
              if (keepMetaValues.has(meta.key)) {
                item.metaValues[meta.key] = meta.value;
              }
            }
            meta = null;
          }
          return;
        }

        if (term) {
          if (name === 'wp:term_taxonomy') term.taxonomy = value.trim();
          else if (name === 'wp:term_slug') term.slug = value.trim();
          else if (name === 'wp:term_name') term.name = value.trim();
          else if (name === 'wp:term_parent') term.parentSlug = value.trim();
          else if (name === 'wp:term') {
            if (term.taxonomy && term.slug) {
              channel.terms.push({
                taxonomy: term.taxonomy,
                slug: term.slug,
                name: term.name ?? '',
                parentSlug: term.parentSlug ?? '',
              });
            }
            term = null;
          }
          return;
        }

        if (item) {
          assignItemField(item, name, value);
          return;
        }

        // Outside an item: the channel's own fields. Guarded on depth so
        // an item's `<title>` never overwrites the site's.
        if (depth === 2) {
          if (name === 'title') channel.title = value.trim();
          else if (name === 'wp:base_site_url') {
            channel.baseSiteUrl = value.trim();
          } else if (name === 'wp:base_blog_url') {
            channel.baseBlogUrl = value.trim();
          }
        }
      },
    },
    { xmlMode: true, recognizeCDATA: true, decodeEntities: true },
  );

  const stream = typeof source === 'string' ? createReadStream(source) : source;

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => parser.write(String(chunk)));
    stream.on('error', reject);
    stream.on('end', () => {
      try {
        parser.end();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  return channel;
}
