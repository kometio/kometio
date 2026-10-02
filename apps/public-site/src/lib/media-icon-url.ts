/*
 * Where the public site loads an image used as an icon from: its own image
 * endpoint, not the media URL the icon value stores.
 *
 * Two reasons, both about the address. The page's Content-Security-Policy
 * lets images in from the site itself and from any https host — so the API
 * address works in production and is refused in development, where the API
 * is plain http on another port, and an icon would be blank on exactly the
 * machine where somebody checks it. Going through `/_image` makes it the
 * site's own origin everywhere. And the picture is resized on the way: an
 * icon is drawn at a few dozen pixels, not at the size it was uploaded.
 */

/** Twice the largest size an icon is drawn at, for a sharp result on a high-density screen. */
const ICON_IMAGE_WIDTH = 96;

export function siteIconImageUrl(mediaUrl: string): string {
  return `/_image?href=${encodeURIComponent(mediaUrl)}&w=${ICON_IMAGE_WIDTH}&f=webp`;
}
