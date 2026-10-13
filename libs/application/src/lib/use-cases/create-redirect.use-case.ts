import { randomUUID } from 'node:crypto';
import {
  Redirect,
  RedirectLimitReachedError,
  type RedirectTarget,
} from '@kometio/domain-core';
import {
  describeRedirectSource,
  REDIRECT_LIMITS,
  type RedirectOrigin,
  type RedirectStatus,
} from '@kometio/shared-types';
import { assertNoLoop } from '../redirects/redirect-loops';
import type { RedirectDeps } from '../redirects/redirect-deps';
import {
  assertTargetStaysOnSite,
  toRedirectTarget,
  type RedirectTargetInput,
} from '../redirects/redirect-target-input';
import { requireSite } from './require-site';

export type CreateRedirectDeps = Pick<
  RedirectDeps,
  | 'redirectRepository'
  | 'missingPathRepository'
  | 'siteRepository'
  | 'pageGroupRepository'
  | 'pageTranslationRepository'
  | 'ruleSets'
>;

export interface CreateRedirectInput {
  tenantId: string;
  siteId: string;
  /** What was typed or pasted as the old address. */
  from: string;
  /** `null` for a rule that says the address is gone. */
  to: RedirectTargetInput | null;
  status: RedirectStatus;
  origin?: RedirectOrigin;
  createdBy: string | null;
  /** `false` where a rule may not leave the site (a public demo). Defaults to `true`. */
  allowExternalTargets?: boolean;
}

/**
 * A rule: this old address goes there.
 *
 * Refused, with the reason, when it cannot work (an address the site
 * answers itself, a target that is not an address, a part the old address
 * does not take, a circle). An address that already has a rule is refused
 * as `RedirectSourceTakenError`: a second would be the same question
 * answered twice.
 */
export async function createRedirect(
  deps: CreateRedirectDeps,
  input: CreateRedirectInput,
): Promise<Redirect> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  const siteRules = await deps.redirectRepository.listBySite(
    input.tenantId,
    site.id,
  );
  if (siteRules.length >= REDIRECT_LIMITS.rulesPerSite) {
    throw new RedirectLimitReachedError(REDIRECT_LIMITS.rulesPerSite);
  }

  let target: RedirectTarget | null = null;
  if (input.status !== 410 && input.to) {
    target = await toRedirectTarget(deps, input.tenantId, site, input.to);
  }
  const redirect = Redirect.create({
    id: randomUUID(),
    tenantId: input.tenantId,
    siteId: site.id,
    from: input.from,
    to: target,
    status: input.status,
    origin: input.origin ?? 'manual',
    createdBy: input.createdBy,
  });
  assertTargetStaysOnSite(redirect.target, input.allowExternalTargets ?? true);
  await assertNoLoop(deps, input.tenantId, site, redirect, siteRules);

  await deps.redirectRepository.add(redirect);
  deps.ruleSets.invalidate(site.id);
  // The address now has an answer: it is not "not found" any more.
  if (redirect.kind === 'exact') {
    await deps.missingPathRepository.clear(
      input.tenantId,
      site.id,
      describeRedirectSource(redirect.source),
    );
  }
  return redirect;
}
