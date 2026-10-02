import { queryOptions } from '@tanstack/react-query';
import {
  getCurrentSite,
  listAvailableThemes,
} from '../../lib/sites-api-client';

/**
 * The site this deployment edits. Takes no id, and its key carries none,
 * because a deployment serves exactly one site (docs/adr/0032) — the API
 * resolves which at runtime (`GET /sites/current`), and the editor no
 * longer has a build-time id to pass.
 *
 * The absent id in the key is the point, not an oversight: every mutation
 * hook writes the updated record straight back into this one entry, and a
 * second, id-keyed entry would be a copy that silently went stale after
 * the first settings save.
 */
export function siteQueryOptions() {
  return queryOptions({
    queryKey: ['sites', 'current'] as const,
    queryFn: () => getCurrentSite(),
  });
}

// Which themes this deployment actually bundled (docs/adr/0042) — same
// image for the life of a running container, so this never needs
// invalidating once fetched.
export function availableThemesQueryOptions() {
  return queryOptions({
    queryKey: ['sites', 'themes', 'available'] as const,
    queryFn: () => listAvailableThemes(),
    staleTime: Infinity,
  });
}
