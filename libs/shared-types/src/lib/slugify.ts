/**
 * Shared by the frontend (live preview while typing a page name) and the
 * backend (defense-in-depth: never trust a client-computed slug), so both
 * sides derive the exact same slug from the exact same input.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents (café -> cafe)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * How long a page's address segment may be. The API refuses anything
 * longer, and the New page dialog says so before asking — `slugify` does
 * not shorten, so a long enough name would otherwise fail only once sent.
 */
export const PAGE_SLUG_MAX_LENGTH = 200;

/**
 * Whether `value` already is a slug — what `slugify` would leave unchanged.
 *
 * The one test for "valid slug", shared by the API, which refuses anything
 * else, and the public site, which must not even ask the API about a path
 * that cannot be a page: `/en/wp-login.php` is not a slug, and asking about
 * it made the API answer 400 and the site answer 500 — to every bot that
 * probes for WordPress, which is most of them.
 */
export function isCanonicalSlug(value: string): boolean {
  return value.length > 0 && value === slugify(value);
}
