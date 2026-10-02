import type { PageGridItem } from '@kometio/shared-types';

export interface GridPage {
  /** The entries this page of the archive shows. */
  items: PageGridItem[];
  /** 1-based, and always inside the list: a `?page=99` on a two-page archive shows the last page rather than nothing. */
  page: number;
  /** 1 when everything fits on one page, which is also what `perPage: 0` means. */
  totalPages: number;
}

/**
 * Which slice of an archive a reader is looking at.
 *
 * Its own function, and pure, because the block that uses it is an Astro
 * component: this is the part worth pinning with tests — off-by-ones here
 * are how the last article of a category becomes unreachable.
 *
 * The page number comes from the URL, so it arrives as whatever somebody
 * typed there. Anything that is not a page of this list is read as the
 * nearest one that is: a reader who edits the address, or follows a link
 * to a page that has since shrunk, is shown an archive rather than an
 * empty screen.
 */
export function paginateGridItems(
  items: PageGridItem[],
  perPage: number,
  requestedPage: unknown,
): GridPage {
  if (!Number.isInteger(perPage) || perPage <= 0 || items.length === 0) {
    return { items, page: 1, totalPages: 1 };
  }
  const totalPages = Math.ceil(items.length / perPage);
  const asked = Number(
    typeof requestedPage === 'string' || typeof requestedPage === 'number'
      ? requestedPage
      : 1,
  );
  const page = Number.isFinite(asked)
    ? Math.min(Math.max(Math.trunc(asked), 1), totalPages)
    : 1;
  const from = (page - 1) * perPage;
  return { items: items.slice(from, from + perPage), page, totalPages };
}

/**
 * The address of another page of the same archive: this URL with `page`
 * replaced, and everything else in it left alone.
 *
 * Page one is written WITHOUT the parameter. Two addresses for one list is
 * a duplicate for search engines and a "which of these is the real one" for
 * anybody who shares it.
 */
export function gridPageHref(url: URL, page: number): string {
  const next = new URL(url.href);
  if (page <= 1) {
    next.searchParams.delete('page');
  } else {
    next.searchParams.set('page', String(page));
  }
  return `${next.pathname}${next.search}`;
}
