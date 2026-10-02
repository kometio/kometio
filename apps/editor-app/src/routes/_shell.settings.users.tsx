import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { usersListSearchSchema } from '../app/users/users-search';
import { usersQueryOptions } from '../app/users/users-queries';
import { UsersListView } from '../app/users/users-list-view';
import { requireAuth } from './-require-auth';
import { requirePermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings/users')({
  beforeLoad: ({ context }) =>
    requirePermission(context.queryClient, 'configureSite'),
  validateSearch: usersListSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps }) =>
    requireAuth(() =>
      context.queryClient.ensureQueryData(usersQueryOptions(deps.page)),
    ),
  component: UsersListRoute,
});

function UsersListRoute() {
  const { page, invite } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (invite) {
      void navigate({ to: '/settings/users', search: { page }, replace: true });
    }
  }, [invite, page, navigate]);
  const { data } = useSuspenseQuery(usersQueryOptions(page));

  return (
    <UsersListView
      items={data.items}
      page={page}
      total={data.total}
      startInviting={invite === true}
    />
  );
}
