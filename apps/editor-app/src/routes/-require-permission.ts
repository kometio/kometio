import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { hasPermission, type Permission } from '@kometio/shared-types';
import { currentSessionQueryOptions } from '../app/auth/use-current-session';
import { requireAuth } from './-require-auth';

/**
 * For a screen that is one role's whole job — the site's settings, its
 * users, its classification (docs/roles.md). The sidebar already does not
 * offer it to anybody else; this covers the address typed or bookmarked by
 * hand, which otherwise opened on the API's refusal as a generic error
 * page. Back to the dashboard instead, before the screen loads anything.
 */
export async function requirePermission(
  queryClient: QueryClient,
  permission: Permission,
): Promise<void> {
  const session = await requireAuth(() =>
    queryClient.ensureQueryData(currentSessionQueryOptions()),
  );
  if (!hasPermission(session.role, permission)) {
    throw redirect({ to: '/' });
  }
}

/**
 * The same, for an area that holds screens for more than one role: the
 * settings are an admin's, except the collections, which a publisher owns.
 * Whoever has none of them has nothing there to open.
 */
export async function requireAnyPermission(
  queryClient: QueryClient,
  permissions: readonly Permission[],
): Promise<void> {
  const session = await requireAuth(() =>
    queryClient.ensureQueryData(currentSessionQueryOptions()),
  );
  if (
    !permissions.some((permission) => hasPermission(session.role, permission))
  ) {
    throw redirect({ to: '/' });
  }
}
