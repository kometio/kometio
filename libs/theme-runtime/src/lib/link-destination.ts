import { localePathFromAncestors } from './locale-path';

/**
 * The three fields every linkable block carries — Button, Link, NavLink,
 * Banner, PromoBar, PricingPlan and Image all share them through
 * `ctaLinkFields()` (libs/block-registry/src/lib/fields/link-type-field.ts).
 *
 * Structurally typed rather than importing `PickedPage`: `shared-types`
 * already depends on this package (page-reference.ts calls
 * `localePathFromAncestors`), so an import back the other way would be a
 * cycle. The shape is the part that matters here anyway — a theme's own
 * Button override gets the same function without taking on a dependency
 * on the content model.
 */
export interface LinkDestination {
  linkType?: 'none' | 'page' | 'url' | null;
  /**
   * `locale`/`slug` are filled in at render by `resolvePageReferences`,
   * never stored — and that function sets the whole thing to `null` when
   * the referenced page has no translation in the locale being rendered.
   * So an unresolved page arrives here as `null` or as a reference with
   * no address, and both mean the same thing: nothing to link to.
   */
  page?: { locale?: string; slug?: string; ancestorSlugs?: string[] } | null;
  url?: string | null;
}

/**
 * Where a block actually points, or `null` when it points nowhere.
 *
 * The rule is that `linkType` decides, alone. It reads as obvious and it
 * was not what the seven components did: each carried its own copy of
 * `linkType === 'page' && page?.locale && page?.slug ? path : url`, whose
 * else-branch hands back the URL **whatever the reason** the page did not
 * resolve — including "the author chose Site page and never picked one".
 * A block would then link to a URL the editor was no longer even showing
 * (ADR-0062 made those fields conditional), and when the URL was empty it
 * rendered `href=""`, which is not an inert link: it reloads the current
 * page.
 *
 * `resolvePageReferences` already wrote down the intended behaviour — its
 * comment calls a page it cannot resolve "the same 'nothing to link to'
 * state a field that was never picked at all already renders as". This is
 * that state, in one place, for every block that has a destination.
 */
export function resolveLinkHref(destination: LinkDestination): string | null {
  const { linkType, page, url } = destination;
  if (linkType === 'page') {
    return page?.locale && page?.slug
      ? localePathFromAncestors(
          page.locale,
          page.ancestorSlugs ?? [],
          page.slug,
        )
      : null;
  }
  if (linkType === 'url') {
    // Trimmed, because a URL that is only whitespace is not a
    // destination — and `href=" "` resolves against the current page
    // exactly like the empty string does.
    const trimmed = url?.trim();
    return trimmed && isLinkableUrl(trimmed) ? trimmed : null;
  }
  // `none` (Image's default) and anything unset: no destination.
  return null;
}

/** The schemes a link may use: the web, an email, a phone number. */
const LINKABLE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Whether an address is one a link may point to: a web address, an email,
 * a phone number, or one without a scheme (a path, `#anchor`, `?query`).
 * Not `javascript:`, `data:` or anything else a browser would run or open
 * in place of following a link.
 *
 * Read as a browser reads it: tabs, newlines and control characters are
 * ignored inside a scheme (`java\tscript:` is `javascript:`), so they are
 * removed before the scheme is looked at.
 */
export function isLinkableUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what a browser ignores in a scheme.
  const compact = url.replace(/[\u0000-\u0020\u007f]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1];
  return scheme === undefined || LINKABLE_SCHEMES.has(scheme.toLowerCase());
}
