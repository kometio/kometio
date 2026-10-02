import type { AcfField } from '@kometio/ports';
import type { Block, PickedMedia } from '@kometio/shared-types';
import {
  asString,
  block,
  mediaReference,
  type AcfConversionResolvers,
  type AcfConversionResult,
} from './acf-conversion';

/**
 * The field types that hold something a visitor reads.
 *
 * Everything else is how the theme was told to draw it — a `select` for
 * which side the image goes on, a `true_false` for whether to show a
 * header. On the first client site measured, `select` was the **most
 * common field type of all** (167 of 557), and eleven of the sixteen
 * fields on its most-used block were settings. A converter that made one
 * block per field would have produced mostly the words "left" and
 * "large".
 */
const CONTENT_TYPES = new Set([
  'text',
  'textarea',
  'wysiwyg',
  'image',
  'gallery',
  'file',
  'oembed',
  'url',
  'link',
  'page_link',
  'email',
]);

/** Types that hold other fields rather than a value of their own. */
const CONTAINER_TYPES = new Set(['group', 'repeater', 'flexible_content']);

/**
 * A `text` field whose name or label says it is a title.
 *
 * A heuristic, and labelled as one: ACF has no "this is the heading"
 * type, so the only evidence is what somebody called the field. It earns
 * its place — a page whose every title arrived as a paragraph reads
 * wrong at a glance — and the mapping layer above this overrides it the
 * moment somebody says what the block really is.
 */
const TITLE_WORDS = /\b(title|titolo|heading|headline|intestazione)\b/i;
const SUBTITLE_WORDS = /\b(subtitle|sottotitolo|subheading|occhiello)\b/i;

/** Nesting deeper than this is a definition that refers to itself. */
const MAX_DEPTH = 10;

/**
 * Whether these definitions describe anything a visitor would read.
 *
 * Asked of a block before any of its instances are looked at, because
 * the answer is a property of the block and not of the one instance that
 * happened to be sampled. A "latest news" block, for example, has seven
 * fields and all of them are settings: it draws a query, and there is no
 * content of its own to bring across.
 */
export function holdsContent(fields: AcfField[], depth = 0): boolean {
  if (depth >= MAX_DEPTH) return false;
  return fields.some(
    (field) =>
      CONTENT_TYPES.has(field.type) ||
      (CONTAINER_TYPES.has(field.type) &&
        holdsContent(field.children, depth + 1)),
  );
}

/**
 * Turns the values of a site's own custom fields into Kometio blocks,
 * guided by the field definitions that travelled with the export.
 *
 * This is the floor of the WordPress import: it runs on a site nobody has
 * configured anything for, because the shape comes out of the export
 * itself (`AcfSchemaReader`). It does not try to see that six fields
 * together are one `MediaText` — that is the mapping above it — but it
 * never loses a word, and it never emits a block for a setting.
 *
 * `values` is flat, the way ACF stores it: a repeater named `slides` with
 * two rows is `{slides: 2, slides_0_title: …, slides_1_title: …}`.
 */
export function convertAcfFields(
  fields: AcfField[],
  values: Record<string, unknown>,
  resolvers: AcfConversionResolvers,
): AcfConversionResult {
  const result: AcfConversionResult = {
    blocks: [],
    unconverted: [],
    settingsSkipped: 0,
  };
  walk(fields, values, '', resolvers, result, 0);
  return result;
}

function walk(
  fields: AcfField[],
  values: Record<string, unknown>,
  prefix: string,
  resolvers: AcfConversionResolvers,
  result: AcfConversionResult,
  depth: number,
): void {
  if (depth >= MAX_DEPTH) return;

  for (const field of fields) {
    if (field.name === '') continue;
    const path = `${prefix}${field.name}`;

    if (CONTAINER_TYPES.has(field.type)) {
      if (field.type === 'group') {
        walk(field.children, values, `${path}_`, resolvers, result, depth + 1);
        continue;
      }
      // A repeater stores how many rows it has under its own name, and
      // each row under `name_INDEX_subfield`.
      const rows = Number(values[path]);
      if (!Number.isFinite(rows) || rows <= 0) continue;
      for (let index = 0; index < rows; index += 1) {
        walk(
          field.children,
          values,
          `${path}_${index}_`,
          resolvers,
          result,
          depth + 1,
        );
      }
      continue;
    }

    if (!CONTENT_TYPES.has(field.type)) {
      // Counted rather than listed: nobody wants to read about every
      // colour picker on the site.
      result.settingsSkipped += 1;
      continue;
    }

    const converted = convertOne(field, values[path], resolvers);
    if (converted === 'empty') continue;
    if (converted === null) {
      result.unconverted.push({ name: path, type: field.type });
      continue;
    }
    result.blocks.push(...converted);
  }
}

/** `'empty'` when there was nothing there; `null` when there was something this cannot place. */
function convertOne(
  field: AcfField,
  value: unknown,
  resolvers: AcfConversionResolvers,
): Block[] | null | 'empty' {
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'wysiwyg': {
      const body = asString(value);
      if (body === '') return 'empty';
      const named = `${field.name} ${field.label}`;
      if (field.type === 'text' && TITLE_WORDS.test(named)) {
        return [block('Heading', { text: body, level: 'h2' })];
      }
      if (field.type === 'text' && SUBTITLE_WORDS.test(named)) {
        return [block('Heading', { text: body, level: 'h3' })];
      }
      return [block('Text', { body })];
    }

    case 'image': {
      const reference = mediaReference(value);
      if (reference === null) return 'empty';
      const media = resolvers.resolveMedia(reference);
      return media
        ? [
            block('Image', {
              media,
              alt: field.label,
              isDecorative: false,
              caption: '',
            }),
          ]
        : null;
    }

    case 'gallery': {
      const references = Array.isArray(value) ? value : [];
      if (references.length === 0) return 'empty';
      const images = references
        .map(mediaReference)
        .filter((reference): reference is string | number => reference !== null)
        .map((reference) => resolvers.resolveMedia(reference))
        .filter((media): media is PickedMedia => media !== null)
        .map((media) => ({
          media,
          alt: field.label,
          isDecorative: false,
          caption: '',
        }));
      return images.length > 0 ? [block('Gallery', { images })] : null;
    }

    case 'file': {
      const reference = mediaReference(value);
      if (reference === null) return 'empty';
      const media = resolvers.resolveMedia(reference);
      return media
        ? [block('FileDownload', { media, label: field.label })]
        : null;
    }

    case 'oembed': {
      const url = asString(value);
      return url === '' ? 'empty' : [block('VideoEmbed', { url })];
    }

    case 'email': {
      const address = asString(value);
      return address === ''
        ? 'empty'
        : [
            block('Button', {
              label: address,
              linkType: 'url',
              page: null,
              url: `mailto:${address}`,
            }),
          ];
    }

    case 'url':
    case 'link':
    case 'page_link':
      return convertLink(field, value, resolvers);

    default:
      return null;
  }
}

/**
 * A link becomes a button, because a link with a label is a button.
 *
 * ACF's `link` is `{url, title, target}`; `url` and `page_link` are a
 * bare string, and `page_link` can be a post id. The label falls back to
 * the field's own name: a button with no words on it is worse than one
 * that says "Scopri di più".
 */
function convertLink(
  field: AcfField,
  value: unknown,
  resolvers: AcfConversionResolvers,
): Block[] | null | 'empty' {
  if (typeof value === 'number') {
    const page = resolvers.resolvePage(value);
    return page
      ? [
          block('Button', {
            label: page.title || field.label,
            linkType: 'page',
            page,
            url: '',
          }),
        ]
      : null;
  }

  let url = '';
  let label = '';
  if (typeof value === 'string') {
    url = value.trim();
  } else if (value !== null && typeof value === 'object') {
    const link = value as { url?: unknown; title?: unknown };
    url = asString(link.url);
    label = asString(link.title);
  }

  if (url === '') return 'empty';
  return [
    block('Button', {
      label: label || field.label,
      linkType: 'url',
      page: null,
      url,
    }),
  ];
}
