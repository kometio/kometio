/**
 * Where uploaded media is served from, as the API builds its URLs
 * (apps/api media.module.ts): under `API_PUBLIC_URL/uploads/` on local
 * disk, under `S3_MEDIA_PUBLIC_BASE_URL/` on S3. Read at runtime, like the
 * API reads them: the address differs per deployment and the image is one.
 */
export function mediaBaseUrls(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const bases: string[] = [];
  const api = env['API_PUBLIC_URL']?.trim();
  if (api) bases.push(`${withoutTrailingSlash(api)}/uploads/`);
  const s3 = env['S3_MEDIA_PUBLIC_BASE_URL']?.trim();
  if (s3) bases.push(`${withoutTrailingSlash(s3)}/`);
  return bases;
}

/**
 * Whether an address is one of this site's own media — the only images
 * the server itself fetches to resize. Compared once normalised, so
 * `../` or `%2e%2e` cannot climb out of the media folder, and an address
 * with a user or password in it is never one.
 */
export function isMediaUrl(url: string, bases: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  return bases.some((base) => parsed.href.startsWith(base));
}

/**
 * What `/_image` must refuse before Astro fetches anything: a remote
 * source that is not this site's media. Anyone can call the endpoint with
 * any `href`, and without this it fetched whatever it was given — from
 * inside the network the site runs in. A local path is Astro's to check
 * (it serves only this site's own files); `null` lets the request through.
 */
export function refusedImageSource(
  requestUrl: URL,
  bases: readonly string[],
): Response | null {
  const href = requestUrl.searchParams.get('href');
  if (href === null || !isRemote(href)) return null;
  return isMediaUrl(href, bases)
    ? null
    : new Response('Forbidden', { status: 403 });
}

/**
 * A scheme, or `//host`: anything the browser would not read as a path here.
 *
 * Read the way the code that fetches reads it, and not by a pattern of ours
 * over the raw text: the URL parser drops tabs and newlines wherever they are,
 * and whitespace and control characters before the address, so `ht\ttps://…`
 * and ` https://…` are remote addresses to it, and "a path" to `^scheme:`.
 * That difference let a request reach whatever the server could reach.
 */
function isRemote(href: string): boolean {
  const seen = withoutLeadingControls(href.replace(/[\t\n\r]/g, ''));
  return (
    URL.canParse(seen) ||
    /^[a-z][a-z0-9+.-]*:/i.test(seen) ||
    /^[\\/]{2}/.test(seen)
  );
}

/** What the URL parser drops from the start: spaces and control characters (U+0000 to U+0020). */
function withoutLeadingControls(text: string): string {
  let start = 0;
  while (start < text.length && text.charCodeAt(start) <= 0x20) start += 1;
  return text.slice(start);
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
