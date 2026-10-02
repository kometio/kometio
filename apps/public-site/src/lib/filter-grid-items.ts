import type { PageGridItem } from '@kometio/shared-types';

/**
 * The one query parameter a filter writes.
 *
 * One name, repeated, rather than one per dimension: two dimensions on
 * the same page would otherwise each need their own parameter name
 * derived from something authorable, and a renamed dimension would break
 * every link anybody had shared.
 */
export const TERM_PARAM = 'term';

/** What the reader has narrowed to, in the order the address says. */
export function selectedTermSlugs(url: URL): string[] {
  const seen = new Set<string>();
  for (const raw of url.searchParams.getAll(TERM_PARAM)) {
    const slug = raw.trim();
    if (slug !== '') seen.add(slug);
  }
  return [...seen];
}

/**
 * The entries that answer to every selected term.
 *
 * AND and not OR: picking "dog food" and then "best seller" reads as
 * narrowing twice, which is what a second click on a second dimension
 * means to the person doing it. OR would make the list grow as they kept
 * choosing, which nobody expects.
 *
 * A slug nobody carries leaves an empty list rather than the whole one:
 * a reader who edits the address, or follows a link to a term that has
 * since been renamed, is shown "nothing here" rather than an unfiltered
 * archive pretending to be a filtered one.
 */
export function filterGridItems(
  items: PageGridItem[],
  selected: string[],
): PageGridItem[] {
  if (selected.length === 0) return items;
  return items.filter((item) =>
    selected.every((slug) => item.termSlugs.includes(slug)),
  );
}

/**
 * The address this term's control points at: this URL with the term
 * toggled, and the page number dropped.
 *
 * Dropping `page` is the whole reason this is not `gridPageHref`'s job:
 * narrowing a list changes how many pages it has, and keeping `?page=4`
 * across a filter lands the reader on a page that may no longer exist.
 *
 * `null` is the way back to everything — every term removed, which is
 * also the address with no parameter at all, so the unfiltered archive
 * keeps one address rather than two.
 */
export function termFilterHref(url: URL, slug: string | null): string {
  const next = new URL(url.href);
  const current = selectedTermSlugs(url);
  const wanted =
    slug === null
      ? []
      : current.includes(slug)
        ? current.filter((value) => value !== slug)
        : [...current, slug];
  next.searchParams.delete(TERM_PARAM);
  for (const value of wanted) next.searchParams.append(TERM_PARAM, value);
  next.searchParams.delete('page');
  return `${next.pathname}${next.search}`;
}
