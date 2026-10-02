import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { dashboardStatsQueryOptions } from '../app/dashboard/dashboard-queries';
import { DashboardView } from '../app/dashboard/dashboard-view';
import { formsQueryOptions } from '../app/forms/forms-queries';
import { siteQueryOptions } from '../app/settings/site-queries';
import { requireAuth } from './-require-auth';

export const Route = createFileRoute('/_shell/')({
  staticData: { titleKey: 'shell.nav.dashboard' },
  // The site has to be resolved before the stats can be asked for, since
  // its id is what scopes them — one extra await, not one extra request:
  // every other screen has already put this same entry in the cache.
  loader: ({ context }) =>
    requireAuth(async () => {
      const site =
        await context.queryClient.ensureQueryData(siteQueryOptions());
      await Promise.all([
        context.queryClient.ensureQueryData(
          dashboardStatsQueryOptions(site.id),
        ),
        // The first page of the forms, for one number: how many there are.
        // The stats count answers, and cannot tell a site with no forms
        // from one whose forms have not been answered yet.
        context.queryClient.ensureQueryData(formsQueryOptions(site.id, 1)),
      ]);
    }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const { data: stats } = useSuspenseQuery(dashboardStatsQueryOptions(site.id));
  const { data: forms } = useSuspenseQuery(formsQueryOptions(site.id, 1));
  return <DashboardView stats={stats} site={site} formCount={forms.total} />;
}
