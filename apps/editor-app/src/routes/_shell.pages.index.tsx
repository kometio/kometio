import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { pageGroupsQueryOptions } from '../app/pages/page-groups-queries';
import { PageGroupsListView } from '../app/pages/page-groups-list-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { toApiFilters } from '../app/pages/pages-list-filters';
import {
  pagesListSearchSchema,
  type PagesListSearch,
} from '../app/pages/pages-list-search';
import { usePagesListFilters } from '../app/pages/use-pages-list-filters';
import { requireAuth } from './-require-auth';

export const Route = createFileRoute('/_shell/pages/')({
  staticData: { titleKey: 'shell.nav.pages' },
  validateSearch: pagesListSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  // Sequential rather than the Promise.all this used to be: the site's id
  // is what scopes the list, so it has to be resolved before the list can
  // be asked for at all.
  loader: ({ context, deps }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      // Warms only the unfiltered page-1(+N)-equivalent fetch (no
      // filters applied yet at first paint) — once the user actually
      // touches the filter bar, the component below refetches via a
      // plain (non-suspense) useQuery instead, see its own comment.
      await context.queryClient.ensureQueryData(
        pageGroupsQueryOptions(site.id, deps.page, { collection: 'none' }),
      );
    }),
  component: PagesListRoute,
});

function PagesListRoute() {
  const search = Route.useSearch();
  const { page, new: startCreating } = search;
  const navigate = useNavigate();
  useEffect(() => {
    if (startCreating) {
      void navigate({
        to: '/pages',
        search: (previous) => ({ ...previous, new: undefined }),
        replace: true,
      });
    }
  }, [startCreating, navigate]);
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  // The filters are in the address, so a filtered list can be reloaded and
  // come back to with the back button. The search text is the exception: it
  // is written (and asked of the server) only once the typing pauses, so a
  // keystroke does not re-run the loader — and, worse, blank the list
  // including the input itself, which a Suspense re-render would.
  const { filters, setFilters, debouncedSearch } = usePagesListFilters(
    search,
    (changes: Omit<PagesListSearch, 'page' | 'new'>) =>
      void navigate({
        to: '/pages',
        // Back to the first page: the third page of a list that has just
        // become shorter may not exist.
        search: (previous) => ({ ...previous, ...changes, page: 1 }),
        replace: true,
      }),
  );

  // A plain (non-suspense) query, not useSuspenseQuery like the initial
  // loader fetch above: filtering/paginating after the first paint must
  // update in place, not blank the screen back to a Suspense fallback.
  // `placeholderData: keepPreviousData` keeps the OLD rows on screen
  // (`isPlaceholderData` true) while a new filter combination loads, instead
  // of flashing empty; the list swaps them for a placeholder meanwhile, so
  // the old rows are not read as the answer to the new filter. Not
  // `data === undefined`: with the old rows kept, it never is after the first
  // load, and the placeholder would never show.
  const { data, isPlaceholderData } = useQuery({
    ...pageGroupsQueryOptions(site.id, page, {
      ...toApiFilters(filters, debouncedSearch),
      // Pages, and nothing filed under a section of its own: three
      // hundred news items in this tree would make both unreadable.
      collection: 'none',
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <PageGroupsListView
      siteId={site.id}
      defaultLocale={site.defaultLocale}
      enabledLocales={site.enabledLocales}
      groups={data?.items ?? []}
      page={page}
      total={data?.total ?? 0}
      filters={filters}
      onFiltersChange={setFilters}
      startCreating={startCreating === true}
      isRefreshing={isPlaceholderData}
    />
  );
}
