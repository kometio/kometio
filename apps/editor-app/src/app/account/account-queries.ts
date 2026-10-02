import { queryOptions } from '@tanstack/react-query';
import { getAccountProfile } from '../../lib/account-api-client';

/**
 * Who is signed in, as they describe themselves — the name and picture
 * the account menu shows, and what the profile page edits.
 *
 * Separate from the session (`useCurrentSession`), which is about what
 * they may open and is cached for good: a name changes while somebody is
 * using the editor, and every save writes the new profile back here.
 */
export function accountProfileQueryOptions() {
  return queryOptions({
    queryKey: ['account', 'profile'] as const,
    queryFn: getAccountProfile,
  });
}
