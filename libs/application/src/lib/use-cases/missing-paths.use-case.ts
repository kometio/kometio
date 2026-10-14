import type { MissingPath, PaginatedResult } from '@kometio/ports';
import type { RedirectDeps } from '../redirects/redirect-deps';
import { requireSite } from './require-site';

export type MissingPathsDeps = Pick<
  RedirectDeps,
  'missingPathRepository' | 'siteRepository'
>;

/** What visitors asked for and the site did not have, most asked for first. */
export async function listMissingPaths(
  deps: MissingPathsDeps,
  input: { tenantId: string; siteId: string; page: number; pageSize: number },
): Promise<PaginatedResult<MissingPath>> {
  await requireSite(deps.siteRepository, input.tenantId, input.siteId);
  return deps.missingPathRepository.list(input.tenantId, input.siteId, {
    page: input.page,
    pageSize: input.pageSize,
  });
}

/** "Not a thing to fix": hidden, and not asked about again. */
export async function dismissMissingPath(
  deps: Pick<MissingPathsDeps, 'missingPathRepository'>,
  input: { tenantId: string; missingPathId: string },
): Promise<void> {
  await deps.missingPathRepository.dismiss(input.tenantId, input.missingPathId);
}
