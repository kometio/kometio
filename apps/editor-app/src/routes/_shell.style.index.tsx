import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { StyleView } from '../app/style/style-view';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/style/')({
  staticData: { titleKey: 'shell.nav.style' },
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'configureSite'),
  loader: ({ context }) =>
    requireAuth(() => context.queryClient.ensureQueryData(siteQueryOptions())),
  component: StyleRoute,
});

function StyleRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());

  return <StyleView site={site} />;
}
