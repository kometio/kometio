import sirv from 'sirv';
import { cacheControlFor } from './asset-cache-control.mjs';

/**
 * The static files of a build (`dist/client`), served by sirv, with the
 * cache rule of `asset-cache-control.mjs`.
 *
 * The rule is given to sirv's `setHeaders`, which runs only for a file that
 * is being served. It was first a header set on the request before sirv
 * looked: a path under `/_astro/` that is not a file (a name the page links
 * to before this build has it, or one somebody made up) fell through to
 * Astro, which answered 404 with the year-long `immutable` already on it,
 * and a browser or a CDN would have kept that 404 for good, for a name the
 * next build may well have.
 */
export function staticAssets(directory) {
  return sirv(directory, {
    dev: false,
    setHeaders(res, pathname) {
      const cacheControl = cacheControlFor(pathname);
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    },
  });
}
