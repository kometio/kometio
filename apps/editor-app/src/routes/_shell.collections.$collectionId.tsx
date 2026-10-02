import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { collectionsQueryOptions } from '../app/collections/collections-queries';
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

export const Route = createFileRoute('/_shell/collections/$collectionId')({
  staticData: { titleKey: 'shell.nav.collections' },
  validateSearch: pagesListSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps, params }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      const collections = await context.queryClient.ensureQueryData(
        collectionsQueryOptions(site.id),
      );
      // A link to a section somebody has since deleted is a 404, not an
      // empty list pretending the section is still there.
      if (!collections.some((one) => one.id === params.collectionId)) {
        throw notFound();
      }
      await context.queryClient.ensureQueryData(
        pageGroupsQueryOptions(site.id, deps.page, {
          collection: params.collectionId,
        }),
      );
    }),
  component: CollectionRoute,
});

function CollectionRoute() {
  const search = Route.useSearch();
  const { page } = search;
  const navigate = useNavigate();
  const { collectionId } = Route.useParams();
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const { data: collections } = useSuspenseQuery(
    collectionsQueryOptions(site.id),
  );
  const collection = collections.find((one) => one.id === collectionId);

  // In the address, like the Pages list's: see PagesListRoute.
  const { filters, setFilters, debouncedSearch } = usePagesListFilters(
    search,
    (changes: Omit<PagesListSearch, 'page' | 'new'>) =>
      void navigate({
        to: '/collections/$collectionId',
        params: { collectionId },
        search: (previous) => ({ ...previous, ...changes, page: 1 }),
        replace: true,
      }),
  );

  const { data, isPlaceholderData } = useQuery({
    ...pageGroupsQueryOptions(site.id, page, {
      ...toApiFilters(filters, debouncedSearch),
      collection: collectionId,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <PageGroupsListView
      key={collectionId}
      siteId={site.id}
      layout="feed"
      collectionId={collectionId}
      title={collection?.name}
      defaultLocale={site.defaultLocale}
      enabledLocales={site.enabledLocales}
      groups={data?.items ?? []}
      page={page}
      total={data?.total ?? 0}
      filters={filters}
      onFiltersChange={setFilters}
      isRefreshing={isPlaceholderData}
    />
  );
}
