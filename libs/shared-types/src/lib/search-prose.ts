import { richTextToPlainText } from './rich-text-to-plain-text';

/**
 * Every prose value goes through `richTextToPlainText`, not only the ones
 * a registry would call rich text (ADR-0046). This file has no registry
 * to ask, and the function leaves a plain string untouched — so a field
 * that becomes rich text later is handled the day it changes, instead of
 * quietly indexing `<p>` and `<strong>` until someone notices the search
 * results have gone strange.
 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? richTextToPlainText(value) : '';
}

export type ProseFieldExtractor = (props: Record<string, unknown>) => string[];

/**
 * A quote and who said it — Quote's fields, which a testimonial, a
 * product review and a pull quote all share because they are drawn by
 * the same two components.
 */
export function quoteProse(props: Record<string, unknown>): string[] {
  return [
    asString(props['quote']),
    asString(props['author']),
    asString(props['role']),
  ];
}

/** A person: TeamMember's fields, which the profile card shares. */
export function teamMemberProse(props: Record<string, unknown>): string[] {
  return [
    asString(props['name']),
    asString(props['role']),
    asString(props['bio']),
  ];
}

/**
 * The alt text of a list of pictures — Gallery's `{ media, alt }[]` shape,
 * which five blocks share under two different key names.
 *
 * Alt text is prose here for Image's reason: it is what the picture says
 * to someone who cannot see it, and on a logo strip it is the only place
 * a partner's name is written at all.
 */
export function pictureAlts(key: string): ProseFieldExtractor {
  return (props) => {
    const pictures = Array.isArray(props[key]) ? props[key] : [];
    return pictures.map((picture: unknown) =>
      picture && typeof picture === 'object' && 'alt' in picture
        ? asString(picture.alt)
        : '',
    );
  };
}
