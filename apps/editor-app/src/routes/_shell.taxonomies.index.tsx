import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { TaxonomiesView } from '../app/taxonomies/taxonomies-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { taxonomiesQueryOptions } from '../app/taxonomies/taxonomies-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/taxonomies/')({
  staticData: { titleKey: 'shell.nav.taxonomies' },
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'changeLiveSite'),
  loader: ({ context }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      await context.queryClient.ensureQueryData(
        taxonomiesQueryOptions(site.id),
      );
    }),
  component: TaxonomiesRoute,
});

function TaxonomiesRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  return <TaxonomiesView siteId={site.id} />;
}
