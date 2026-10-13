import { MAX_MISSING_PATHS_HELD } from '@kometio/ports';
import type { MissingPath, PaginatedResult } from '@kometio/ports';
import { readRequestedAddress } from '@kometio/shared-types';
import type { RedirectDeps } from '../redirects/redirect-deps';
import { requireSite } from './require-site';

export type MissingPathsDeps = Pick<
  RedirectDeps,
  'missingPathRepository' | 'siteRepository' | 'ruleSets'
>;

/** A kept address (`/old`, `/?p=123`) as a request for it would arrive. */
function asRequested(path: string) {
  const at = path.indexOf('?');
  return at === -1
    ? readRequestedAddress(path, '')
    : readRequestedAddress(path.slice(0, at), path.slice(at));
}

/**
 * What visitors asked for and the site did not have, most asked for first —
 * and still does not: an address a rule answers now is not on it.
 *
 * Judged when it is read, against the rules as they are, and not by clearing
 * rows when a rule is made: a miss is written a few seconds after it
 * happened, so one that was waiting when its rule was made would put the
 * address back; and one pattern (`/:year/:month/:slug`) answers hundreds of
 * the addresses of a site that was just moved, which no row-by-row clearing
 * could follow. The table has a size (`MAX_MISSING_PATHS`), so reading all of
 * it to judge it is a bounded cost, paid by a person looking at a list.
 */
export async function listMissingPaths(
  deps: MissingPathsDeps,
  input: { tenantId: string; siteId: string; page: number; pageSize: number },
): Promise<PaginatedResult<MissingPath>> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  const [held, { matcher }] = await Promise.all([
    deps.missingPathRepository.list(input.tenantId, input.siteId, {
      page: 1,
      pageSize: MAX_MISSING_PATHS_HELD,
    }),
    deps.ruleSets.forSite(input.tenantId, input.siteId),
  ]);
  const unanswered = held.items.filter(
    (item) => matcher.match(asRequested(item.path)) === null,
  );
  const start = (input.page - 1) * input.pageSize;
  return {
    items: unanswered.slice(start, start + input.pageSize),
    total: unanswered.length,
  };
}

/** "Not a thing to fix": hidden, and not asked about again. */
export async function dismissMissingPath(
  deps: Pick<MissingPathsDeps, 'missingPathRepository'>,
  input: { tenantId: string; missingPathId: string },
): Promise<void> {
  await deps.missingPathRepository.dismiss(input.tenantId, input.missingPathId);
}
