import type { APIRoute } from 'astro';
import { isMediaUrl, mediaBaseUrls } from '../../lib/media-url';

export const prerender = false;

/** A web font is tens of kilobytes; the upload refuses more than ten megabytes (upload-media.use-case.ts). */
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** What the bytes say, and the only thing believed: the name and the header are the uploader's. */
function webFontType(bytes: Uint8Array): string | null {
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (signature === 'wOF2') return 'font/woff2';
  if (signature === 'wOFF') return 'font/woff';
  return null;
}

/**
 * A font the site uploaded (docs/adr/0147), served from the site's own
 * origin (site-font-url.ts says why).
 *
 * Only this site's media is fetched, by the rule `/_image` follows
 * (media-url.ts): anyone can call this with any `href`, and without the rule
 * the server would fetch whatever it was given from inside its network. No
 * redirect is followed, for the same reason. What comes back is sent on only
 * if its bytes are a WOFF2 or WOFF font.
 *
 * The file behind an address never changes (a new upload is a new address),
 * so a browser may keep it for a year. Any origin may load it, as any origin
 * may load the page: the editor's canvas shows the page from an opaque one.
 */
export const GET: APIRoute = async ({ url }) => {
  const href = url.searchParams.get('href');
  if (href === null || !isMediaUrl(href, mediaBaseUrls())) {
    return new Response('Forbidden', { status: 403 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(href, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }
  if (!upstream.ok) return new Response('Not Found', { status: 404 });
  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FONT_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_FONT_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }
  const type = webFontType(bytes);
  if (type === null) {
    return new Response('Unsupported Media Type', { status: 415 });
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
