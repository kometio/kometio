/*
 * An icon that is an image from the media library rather than one of the
 * theme's sets — for a mark the sets do not have: LinkedIn, gone from
 * simple-icons at its owner's request, and every other logo nobody
 * bundled.
 *
 * An icon field holds a string: `name` for an interface icon, `brand:name`
 * for a logo (ADR-0053), and `media:<mediaId>:<url>` for this. The URL is
 * what renders it — a block renders from its props alone — and the id is
 * kept beside it so the picked file is still identifiable later, the same
 * two halves a picked image carries (`PickedMedia`).
 *
 * Shared because the public site renders it and the editor previews it,
 * and a value one of them wrote and the other could not read would be an
 * icon that shows in one place and not the other.
 */

const PREFIX = 'media:';

/** Whether a stored icon value is an image from the media library, well formed or not. */
export function isMediaIcon(value: string): boolean {
  return value.startsWith(PREFIX);
}

export interface MediaIcon {
  mediaId: string;
  url: string;
}

export function mediaIconValue(media: {
  mediaId: string;
  url: string;
}): string {
  return `${PREFIX}${media.mediaId}:${media.url}`;
}

/**
 * The media icon a value names, or `null` for any other kind of icon — and
 * for a value whose address is not a plain web or site-relative one, so
 * nothing but an image URL ever reaches an `href` in the markup.
 */
export function parseMediaIcon(value: string): MediaIcon | null {
  if (!isMediaIcon(value)) return null;
  const rest = value.slice(PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return null;
  const mediaId = rest.slice(0, separator);
  const url = rest.slice(separator + 1);
  if (!/^(https?:\/\/|\/)/.test(url)) return null;
  return { mediaId, url };
}

/**
 * The image wrapped in an SVG the size of any other icon, so every place
 * that draws an icon's markup — a button, a feature, a menu link — draws
 * this one too, with no second code path. It does not take the text colour
 * the way a set icon does: it is a picture, shown as it is.
 */
export function mediaIconSvg(url: string): string {
  const href = url
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><image href="${href}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>`;
}
