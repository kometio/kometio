import type { PickedMedia } from '@kometio/shared-types';
import {
  asString,
  block,
  mediaReference,
  type AcfConversionResolvers,
  type AcfConversionResult,
} from './acf-conversion';

/**
 * Keys whose name says the value configures rather than says something.
 *
 * Matched as the whole key or as its last part, which is what tells
 * `height` and `title_size` from `slides_0_title`. All of them name how
 * a thing is drawn or behaves; none of them is ever something a visitor
 * reads.
 */
const SETTING_WORDS = [
  'size',
  'color',
  'colour',
  'height',
  'width',
  'align',
  'alignment',
  'position',
  'direction',
  'style',
  'layout',
  'variant',
  'radius',
  'padding',
  'margin',
  'target',
  'overlay',
  'opacity',
  'columns',
  'gap',
  'speed',
  'delay',
  'duration',
  'order',
];

function namesASetting(key: string): boolean {
  const lower = key.toLowerCase();
  return SETTING_WORDS.some(
    (word) => lower === word || lower.endsWith(`_${word}`),
  );
}

/** Keys whose name says the value points at a picture. */
const MEDIA_WORDS = /(image|images|photo|foto|media|logo|icon|gallery|file)$/i;

/** A title, when there is no definition to say so: the key must END in a title word. */
const TITLE_KEY = /(^|_)(title|titolo|heading|headline|intestazione)$/i;
const SUBTITLE_KEY = /(^|_)(subtitle|sottotitolo|subheading|occhiello)$/i;

const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i;
const BARE_URL = /^(https?:\/\/|\/|mailto:|tel:)\S*$/i;

/**
 * Recovers what a block holds when the export does not describe it.
 *
 * Not a fallback for rare cases: on the first client site measured, four
 * of its nine block types had **no field group in the export at all** —
 * 12 of 58 instances — because the theme registers those fields in PHP
 * rather than in the database, which is ordinary practice. Without this
 * their words would simply be gone, and "it brings the pages and what is
 * inside them" would be untrue for a fifth of them.
 *
 * With no types to go on, the evidence is the shape of each value and
 * the name of its key. ACF writes a `_name` mirror beside every field,
 * which is how the real fields are told apart from anything else, and
 * writes a repeater's rows as `name_0_sub`, `name_1_sub` — in order, so
 * walking the keys as they come keeps the rows together.
 *
 * When the evidence is thin it emits text. Something that was a setting
 * arriving as a stray word is visible and deletable; a paragraph that
 * never arrived is neither.
 */
export function recoverAcfValues(
  values: Record<string, unknown>,
  resolvers: AcfConversionResolvers,
): AcfConversionResult {
  const result: AcfConversionResult = {
    blocks: [],
    unconverted: [],
    settingsSkipped: 0,
  };

  for (const [key, value] of Object.entries(values)) {
    // `_title` mirrors `title` with the field's key. It is bookkeeping.
    if (key.startsWith('_')) continue;

    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (typeof value === 'boolean' || isBooleanish(value)) {
      result.settingsSkipped += 1;
      continue;
    }

    if (typeof value === 'string' && HEX_COLOUR.test(value.trim())) {
      result.settingsSkipped += 1;
      continue;
    }

    if (namesASetting(key)) {
      result.settingsSkipped += 1;
      continue;
    }

    if (MEDIA_WORDS.test(key)) {
      const references = Array.isArray(value) ? value : [value];
      const media = references
        .map(mediaReference)
        .filter((reference): reference is string | number => reference !== null)
        .map((reference) => resolvers.resolveMedia(reference))
        .filter((picked): picked is PickedMedia => picked !== null);
      if (media.length === 0) {
        result.unconverted.push({ name: key, type: 'image' });
      } else if (media.length === 1) {
        result.blocks.push(
          block('Image', {
            media: media[0],
            alt: '',
            isDecorative: false,
            caption: '',
          }),
        );
      } else {
        result.blocks.push(
          block('Gallery', {
            images: media.map((one) => ({
              media: one,
              alt: '',
              isDecorative: false,
              caption: '',
            })),
          }),
        );
      }
      continue;
    }

    // `{url, title}` is how ACF stores a link, whatever it is called.
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const link = value as { url?: unknown; title?: unknown };
      const url = asString(link.url);
      if (url !== '') {
        result.blocks.push(
          block('Button', {
            label: asString(link.title) || url,
            linkType: 'url',
            page: null,
            url,
          }),
        );
      }
      continue;
    }

    const body = typeof value === 'number' ? String(value) : asString(value);
    if (body === '') continue;

    if (BARE_URL.test(body)) {
      result.blocks.push(
        block('Button', {
          label: body,
          linkType: 'url',
          page: null,
          url: body,
        }),
      );
      continue;
    }

    if (TITLE_KEY.test(key)) {
      result.blocks.push(block('Heading', { text: body, level: 'h2' }));
    } else if (SUBTITLE_KEY.test(key)) {
      result.blocks.push(block('Heading', { text: body, level: 'h3' }));
    } else {
      result.blocks.push(block('Text', { body }));
    }
  }

  return result;
}

/** ACF writes a checkbox as the string `"0"` or `"1"`. */
function isBooleanish(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['0', '1', 'true', 'false'].includes(value.trim().toLowerCase())
  );
}
