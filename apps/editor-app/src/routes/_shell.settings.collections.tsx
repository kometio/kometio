import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CollectionsSection } from '../app/collections/collections-section';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings/collections')({
  // A collection goes live without a publish, so it is a publisher's.
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'changeLiveSite'),
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: CollectionsRoute,
});

function CollectionsRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return <CollectionsSection siteId={site.id} />;
}
