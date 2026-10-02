import type { PickedMedia } from '@kometio/shared-types';

/**
 * What a picture says to somebody who cannot see it: the text the block
 * holds for it, and while that is empty, the one the library holds for the
 * file — written once in Media, and travelling with the picked file
 * (`PickedMedia.alt`). A decorative picture says nothing, whatever was typed
 * before the flag was ticked: WCAG wants `alt=""` for it.
 *
 * The one place the rule lives, so the blocks that show a picked file
 * (Image, Card, Gallery, Before/After) cannot drift apart: an Image used to
 * read the library and the others did not.
 */
export function resolveImageAlt(picture: {
  alt: string;
  isDecorative: boolean;
  media: Pick<PickedMedia, 'alt'> | null;
}): string {
  if (picture.isDecorative) return '';
  return picture.alt.trim() ? picture.alt : (picture.media?.alt ?? '');
}

/**
 * For a picture that has a role rather than a text of its own: a "Before"
 * and an "After" are told apart by their label, and what the library holds
 * for the file says what the picture is of — "Before: the kitchen, with the
 * old tiles". With nothing in the library it is the label alone, as it was.
 */
export function labelledImageAlt(
  label: string,
  media: Pick<PickedMedia, 'alt'> | null,
): string {
  const described = media?.alt?.trim();
  return described ? `${label}: ${described}` : label;
}
