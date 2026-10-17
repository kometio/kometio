/**
 * Where a page loads a font the site uploaded from (docs/adr/0147): the
 * site's own endpoint, which fetches the file from the media library.
 *
 * Not the library's address itself, for the reason `/_image` exists for
 * pictures (media-icon-url.ts): the page's Content-Security-Policy lets
 * fonts in from the site itself, a font is loaded with CORS and the library
 * may be another origin, and the editor's canvas shows the page from an
 * opaque origin. One address of the site's own works for all three.
 */
export const SITE_FONT_ENDPOINT = '/api/site-font';

export function siteFontUrl(mediaUrl: string): string {
  return `${SITE_FONT_ENDPOINT}?href=${encodeURIComponent(mediaUrl)}`;
}
