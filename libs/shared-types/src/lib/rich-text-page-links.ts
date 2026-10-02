import type { PageGroupSlugMap } from './page-reference';

/**
 * The scheme a link to another Kometio page uses while it lives inside a
 * rich text value (ADR-0046).
 *
 * Everywhere else, a page link is a block PROP — `{ pageGroupId, title }`
 * on `page`, resolved to the reader's locale at render
 * (`resolvePageReferences` below). That indirection is what makes renaming
 * or moving a page harmless, and what lets one stored link point at the
 * Italian page for an Italian reader and the English one for an English
 * reader.
 *
 * Inside an HTML string there is no prop to put it in, so the reference
 * goes where the browser expects an address and is swapped for the real
 * path on the way out. Storing the path directly instead would bake in
 * the locale and the slug at the moment of writing — exactly the bug
 * `pickedPageSchema` was changed to stop having.
 */
export const KOMETIO_PAGE_LINK_SCHEME = 'kometio';
export const KOMETIO_PAGE_LINK_PREFIX = `${KOMETIO_PAGE_LINK_SCHEME}://page/`;

/** The href to store for a link to `pageGroupId`. */
export function buildPageLinkHref(pageGroupId: string): string {
  return `${KOMETIO_PAGE_LINK_PREFIX}${pageGroupId}`;
}

/**
 * Matches the whole `href` ATTRIBUTE, not just the value, because an
 * unresolvable reference has to take the attribute with it (see
 * `resolveRichTextPageLinks`).
 *
 * Safe to do by pattern rather than by parsing: this is not "reading HTML
 * with a regular expression". The attribute is one we wrote ourselves, in
 * a document `sanitizeRichText` has already normalised — quoting included
 * — and the id is an opaque token that cannot occur in the surrounding
 * markup by accident.
 */
const PAGE_LINK_HREF = new RegExp(
  `\\s*href="${KOMETIO_PAGE_LINK_SCHEME}://page/([^"]+)"`,
  'gi',
);

/** Every page this rich text links to. Empty for text with no internal links, at the cost of one substring check. */
export function collectRichTextPageReferences(value: string): string[] {
  if (!value.includes(KOMETIO_PAGE_LINK_PREFIX)) {
    return [];
  }
  const ids: string[] = [];
  for (const [, id] of value.matchAll(PAGE_LINK_HREF)) {
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Swaps every stored reference for the address it resolves to right now.
 *
 * `resolveHref` returning `null` means "no page to link to in this
 * locale" — deleted, or never translated. The anchor then loses its
 * `href` and keeps its text, which is deliberately the SAME outcome the
 * block-prop path already produces: `resolveBlock` sets `page: null`, and
 * Link.astro renders an `<a>` with no address. Leaving the `kometio://`
 * href in the page instead would ship a link no browser can follow, and
 * leak an internal id into public HTML.
 */
export function resolveRichTextPageLinks(
  value: string,
  resolveHref: (pageGroupId: string) => string | null,
): string {
  if (!value.includes(KOMETIO_PAGE_LINK_PREFIX)) {
    return value;
  }
  return value.replace(PAGE_LINK_HREF, (_whole, pageGroupId: string) => {
    const href = resolveHref(pageGroupId);
    return href === null ? '' : ` href="${href}"`;
  });
}

/**
 * The `resolveHref` a render pass wants: the page's path in the locale
 * being rendered, or null if it has none.
 *
 * The whole ancestor chain, not just the slug — slugs are scoped to their
 * siblings (ADR-0029), so a link to a nested page written as `/it/guida`
 * points at nothing. A link inside a sentence has to land exactly where
 * the Link block's would.
 */
export function pageLinkResolverFor(
  slugByGroupId: PageGroupSlugMap,
  toPath: (locale: string, ancestorSlugs: string[], slug: string) => string,
): (pageGroupId: string) => string | null {
  return (pageGroupId) => {
    const resolved = slugByGroupId.get(pageGroupId);
    return resolved
      ? toPath(resolved.locale, resolved.ancestorSlugs, resolved.slug)
      : null;
  };
}
