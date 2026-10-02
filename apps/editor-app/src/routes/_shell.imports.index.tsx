import { createFileRoute } from '@tanstack/react-router';
import { ImportView } from '../app/imports/import-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/imports/')({
  staticData: { titleKey: 'shell.nav.imports' },
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'configureSite'),
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: ImportRoute,
});

function ImportRoute() {
  const site = Route.useLoaderData();
  return <ImportView siteId={site.id} />;
}
