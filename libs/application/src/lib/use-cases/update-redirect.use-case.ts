import { RedirectNotFoundError, type Redirect } from '@kometio/domain-core';
import type { RedirectStatus } from '@kometio/shared-types';
import { assertNoLoop } from '../redirects/redirect-loops';
import type { RedirectDeps } from '../redirects/redirect-deps';
import {
  toRedirectTarget,
  type RedirectTargetInput,
} from '../redirects/redirect-target-input';
import { requireSite } from './require-site';

export type UpdateRedirectDeps = Pick<
  RedirectDeps,
  | 'redirectRepository'
  | 'siteRepository'
  | 'pageGroupRepository'
  | 'pageTranslationRepository'
  | 'ruleSets'
>;

export interface UpdateRedirectInput {
  tenantId: string;
  redirectId: string;
  /** The old address, when it is being changed. */
  from?: string;
  /** Where to, and with which answer: always together, since each decides what the other may be. */
  to: RedirectTargetInput | null;
  status: RedirectStatus;
}

export async function updateRedirect(
  deps: UpdateRedirectDeps,
  input: UpdateRedirectInput,
): Promise<Redirect> {
  const redirect = await deps.redirectRepository.findById(
    input.tenantId,
    input.redirectId,
  );
  if (!redirect) throw new RedirectNotFoundError(input.redirectId);
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    redirect.siteId,
  );

  // The address first, so that the target is read against what it now takes.
  if (input.from !== undefined) redirect.changeSource(input.from);
  const target =
    input.status !== 410 && input.to
      ? await toRedirectTarget(deps, input.tenantId, site, input.to)
      : null;
  redirect.redirectTo(target, input.status);

  const siteRules = await deps.redirectRepository.listBySite(
    input.tenantId,
    site.id,
  );
  await assertNoLoop(deps, input.tenantId, site, redirect, siteRules);

  await deps.redirectRepository.save(redirect);
  deps.ruleSets.invalidate(site.id);
  return redirect;
}
