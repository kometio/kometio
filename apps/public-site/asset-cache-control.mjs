// What the production server tells a cache about a static file.
//
// The files under `/_astro/` are the build's bundles and carry a hash of
// their content in their names: a file with that name never changes, and a
// new build has new names. They may be kept for as long as anybody likes, and
// a visitor who comes back — or a CDN that was put in front — should not ask
// for them again. Without this the server said nothing about them but when
// they were last modified, so every visit revalidated a dozen files.
//
// Everything else is left as it was: the files of `public/` (the favicon) are
// not hashed, and the pages are rendered per request (their CSP has a nonce
// of the request's own, which a shared cache must not keep).
//
// `/_image` is not here: Astro's own endpoint already sends
// `public, max-age=31536000` for what it makes.
export const HASHED_ASSETS_PREFIX = '/_astro/';

const ONE_YEAR_IN_SECONDS = 31_536_000;

/** The `Cache-Control` value for a request's URL, or `undefined` to say nothing. */
export function cacheControlFor(url) {
  return typeof url === 'string' && url.startsWith(HASHED_ASSETS_PREFIX)
    ? `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`
    : undefined;
}
