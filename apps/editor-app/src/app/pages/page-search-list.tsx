import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  PAGE_GROUPS_PAGE_SIZE,
  pageGroupsQueryOptions,
} from './page-groups-queries';
import { ListItemButton } from '../../components/ui/list-item-button';
import { Pagination } from '../common/pagination';

export interface PageSearchItem {
  pageGroupId: string;
  title: string;
  slug: string;
  /**
   * How far under another page in THIS set of results it sits — not its
   * real depth in the site.
   *
   * The distinction matters once a search is on: the server sends the
   * pages whose title matches, and a match three levels down arrives
   * without its ancestors. Indenting it by its real depth would draw a
   * tree with no trunk. Here it is 0, which is the truth about what is
   * on screen.
   */
  depth: number;
}

export interface PageSearchListProps {
  siteId: string;
  /** Which language's titles and addresses are listed — only pages that have one are offered. */
  locale: string;
  /**
   * Not fetched while false — what both callers pass is "is the panel
   * open".
   *
   * Radix unmounts a closed popover's and a closed dialog's content, so
   * in practice this component does not render while shut; the flag is
   * what keeps that from being load-bearing, and what makes the list
   * start fresh rather than on whatever page it was left on.
   */
  enabled?: boolean;
  /** Leaves out this page and everything under it — resolved by the server, which is the only side that has the whole tree. */
  excludeSubtreeOf?: string;
  /** Rendered as the first row, above the results — the parent picker's "at the top level". */
  header?: ReactNode;
  /** Marked as the current answer, when one of the rows is it. */
  selectedId?: string | null;
  onSelect: (item: PageSearchItem) => void;
}

/**
 * Choosing one of a site's pages, by searching for it.
 *
 * One component for the two places that ask: the parent picker, inside a
 * popover, and the page picker a link uses, inside a dialog. They used to
 * share nothing and both showed the first twenty pages with no way to
 * reach the twenty-first — the parent picker could not even paginate,
 * since the tree it drew needed the whole list at once.
 *
 * The search is the server's (`?search=`, a case-insensitive match on the
 * title in this language), not a filter over the page already fetched —
 * filtering twenty rows client-side is exactly the bug this replaces.
 */
export function PageSearchList({
  siteId,
  locale,
  enabled = true,
  excludeSubtreeOf,
  header,
  selectedId,
  onSelect,
}: PageSearchListProps) {
  const { t } = useTranslation();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isPending } = useQuery({
    ...pageGroupsQueryOptions(siteId, page, {
      locale,
      excludeSubtreeOf,
      search: search.trim() || undefined,
    }),
    enabled,
  });

  const items = offerablePages(data?.items ?? [], locale);
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / PAGE_GROUPS_PAGE_SIZE),
  );

  function changeSearch(next: string) {
    setSearch(next);
    // Page 4 of the old results is not page 4 of the new ones, and is
    // usually past their end — which would show an empty list for a
    // search that matched.
    setPage(1);
  }

  return (
    // `min-h-0` so the list below may shrink inside a flex parent that is
    // itself height-capped (the popover): without it a flex child refuses
    // to go under its content height and the panel overflows instead.
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-1">
        {/* Named for a screen reader but not drawn: the panel's own
            trigger already says what is being chosen, and a second
            visible heading over the field read as a third question. */}
        <Label htmlFor={searchId} className="sr-only">
          {t('pages.picker.search')}
        </Label>
        <Input
          id={searchId}
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
          placeholder={t('pages.picker.searchPlaceholder')}
        />
      </div>

      {!isPending && items.length === 0 && !header && (
        <p className="text-muted-foreground text-sm">
          {t('pages.picker.empty')}
        </p>
      )}

      {(items.length > 0 || header) && (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border sm:max-h-64">
          {header}
          {items.map((item) => (
            <li key={item.pageGroupId}>
              <ListItemButton
                inset="row"
                onClick={() => onSelect(item)}
                aria-current={
                  item.pageGroupId === selectedId ? 'true' : undefined
                }
              >
                <span
                  className="truncate"
                  // Indentation rather than nested lists: the set can be a
                  // tree or a flat list of matches, and a style that
                  // degrades to "no indent" needs no second layout.
                  style={{ paddingInlineStart: `${item.depth}rem` }}
                >
                  {item.title}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {item.slug}
                </span>
              </ListItemButton>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="flex shrink-0 items-center justify-center gap-3"
      />
    </div>
  );
}

/**
 * The rows to draw: parents before their children, each page named in the
 * asked-for language.
 *
 * A page with no translation in this language is left out rather than
 * shown under another language's title — it has no address here, so
 * choosing it would mean nothing (docs/adr/0018). The server already
 * filters on `locale`; this is what keeps the two in step when it does
 * not, and what turns a translation into a title.
 */
function offerablePages(
  records: PageGroupListItemRecord[],
  locale: string,
): PageSearchItem[] {
  const byParent = new Map<string | null, PageGroupListItemRecord[]>();
  const present = new Set(records.map((record) => record.id));
  for (const record of records) {
    // A page whose parent did not come back in this set is drawn at the
    // top: it is not a child of anything on screen.
    const parentId =
      record.parentId && present.has(record.parentId) ? record.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(record);
    byParent.set(parentId, siblings);
  }

  const items: PageSearchItem[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const record of byParent.get(parentId) ?? []) {
      const here = record.translations.find(
        (translation) => translation.locale === locale,
      );
      if (here) {
        items.push({
          pageGroupId: record.id,
          title: here.title || here.slug,
          slug: here.slug,
          depth,
        });
      }
      walk(record.id, here ? depth + 1 : depth);
    }
  };
  walk(null, 0);
  return items;
}
