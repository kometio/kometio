import { queryOptions, useQuery } from '@tanstack/react-query';
import { hasPermission, type Permission } from '@kometio/shared-types';
import { currentSession, type CurrentSession } from '../../lib/auth-api-client';

const currentSessionQueryKey = ['auth', 'session'] as const;

/** Shared by the hook and the route guard, so both read one cache entry. */
export function currentSessionQueryOptions() {
  return queryOptions({
    queryKey: currentSessionQueryKey,
    queryFn: currentSession,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Who is logged in.
 *
 * Asked once and cached for the whole session: a role does not change
 * while somebody is using the editor, and re-asking on every screen
 * would put a request in front of a sidebar that has to be there
 * immediately.
 *
 * While it is loading, and if it fails, `role` is null — and every
 * caller must read that as "do not show the admin-only things yet"
 * rather than "show them". Guessing generously here would put the
 * screens back that this exists to hide.
 */
export function useCurrentSession(): {
  session: CurrentSession | undefined;
  role: CurrentSession['role'] | null;
  /** Whether this person may, by the same table the API checks (docs/roles.md). */
  can: (permission: Permission) => boolean;
} {
  const { data } = useQuery(currentSessionQueryOptions());
  return {
    session: data,
    role: data?.role ?? null,
    can: (permission) => hasPermission(data?.role, permission),
  };
}
