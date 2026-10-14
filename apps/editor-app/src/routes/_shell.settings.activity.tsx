import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ActivitySection } from '../app/activity/activity-section';
import { activitySearchSchema } from '../app/activity/activity-search';
import { activityQueryOptions } from '../app/activity/activity-queries';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings/activity')({
  // What the administrators did, and who tried to be one: an administrator's.
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'configureSite'),
  validateSearch: activitySearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps }) =>
    requireAuth(() =>
      context.queryClient.ensureQueryData(activityQueryOptions(deps.page)),
    ),
  component: ActivityRoute,
});

function ActivityRoute() {
  const { page } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(activityQueryOptions(page));

  return (
    <ActivitySection
      items={data.items}
      page={page}
      total={data.total}
      onPageChange={(next) =>
        void navigate({ to: '/settings/activity', search: { page: next } })
      }
    />
  );
}
