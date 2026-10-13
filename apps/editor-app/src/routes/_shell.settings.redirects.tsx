import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { RedirectsSection } from '../app/redirects/redirects-section';
import { redirectsSearchSchema } from '../app/redirects/redirects-search';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings/redirects')({
  // A redirect is live at once, like a collection: a publisher's.
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'changeLiveSite'),
  validateSearch: redirectsSearchSchema,
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: RedirectsRoute,
});

function RedirectsRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <RedirectsSection
      siteId={site.id}
      defaultLocale={site.defaultLocale}
      enabledLocales={site.enabledLocales}
      search={search}
      onSearchChange={(next, options) =>
        void navigate({
          to: '/settings/redirects',
          search: next,
          replace: options?.replace === true,
        })
      }
    />
  );
}
