import type { Redirect } from '@kometio/domain-core';
import type { RedirectRepositoryPort } from '@kometio/ports';
import {
  compileRedirectMatcher,
  type RedirectMatcher,
} from '@kometio/shared-types';

export interface RedirectRuleSet {
  rules: readonly Redirect[];
  matcher: RedirectMatcher<Redirect>;
}

/** A change shows within this long on another process; on the one that made it, at once. */
const DEFAULT_TTL_MS = 15_000;

/**
 * The compiled rules of each site, kept for a few seconds.
 *
 * Asked once per 404, and a site's 404s come in floods (a scanner, a
 * crawler that found a dead link on a page), so reading and compiling up to
 * ten thousand rules for each would be a cost anyone could make the server
 * pay. A concurrent request waits for the read that is already under way.
 *
 * A rule written through this process invalidates its site's set (the
 * write use cases call `invalidate`); another process catches up on the
 * time limit, which a rule is never urgent enough to need shorter.
 */
export class RedirectRuleSets {
  private readonly sets = new Map<
    string,
    { expiresAt: number; set: Promise<RedirectRuleSet> }
  >();

  constructor(
    private readonly repository: Pick<RedirectRepositoryPort, 'listBySite'>,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  forSite(tenantId: string, siteId: string): Promise<RedirectRuleSet> {
    const known = this.sets.get(siteId);
    if (known && known.expiresAt > this.now()) return known.set;

    const set = this.repository.listBySite(tenantId, siteId).then((rules) => ({
      rules,
      matcher: compileRedirectMatcher(rules),
    }));
    this.sets.set(siteId, { expiresAt: this.now() + this.ttlMs, set });
    // A failed read is not kept: the next request asks again.
    set.catch(() => {
      if (this.sets.get(siteId)?.set === set) this.sets.delete(siteId);
    });
    return set;
  }

  invalidate(siteId: string): void {
    this.sets.delete(siteId);
  }
}
