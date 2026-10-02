import { createFileRoute, redirect } from '@tanstack/react-router';
import { usersListSearchSchema } from '../app/users/users-search';

// Moved under /settings: see the integrations route. The page number goes
// with it, so "page 3 of the users" is still page 3.
export const Route = createFileRoute('/_shell/users/')({
  validateSearch: usersListSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/settings/users', search: { page: search.page } });
  },
});
