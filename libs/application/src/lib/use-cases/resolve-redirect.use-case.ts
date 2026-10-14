import { readRequestedAddress, redirectLocation } from '@kometio/shared-types';
import type { RedirectTrafficPort } from '@kometio/ports';
import { followRedirects } from '../redirects/follow-redirects';
import { missingAddressOf } from '../redirects/missing-address';
import { pageAnswersAt } from '../redirects/page-answers';
import { pageTargetInfo } from '../redirects/published-page-path';
import type { RedirectDeps } from '../redirects/redirect-deps';

export type ResolveRedirectDeps = Pick<
  RedirectDeps,
  | 'siteRepository'
  | 'pageGroupRepository'
  | 'pageTranslationRepository'
  | 'ruleSets'
> & { traffic: RedirectTrafficPort };

export interface ResolveRedirectInput {
  tenantId: string;
  /** The host the visitor asked, which names the site. */
  domain: string;
  /** What the visitor asked for: the request's path and its query string (`?a=1`, or empty). */
  pathname: string;
  search: string;
}

export type RedirectResolution =
  | { outcome: 'redirect'; status: 301 | 302; location: string }
  | { outcome: 'gone' };

/**
 * What to answer a visitor who asked for an address the site did not have —
 * asked by the public site only once its own routes have said "not found"
 * (and for the front door with a `?p=123`, which no route answers), so a
 * page always wins over a rule and nothing here is on the path of a page
 * that exists.
 *
 * Counts, as it answers: the rule that was used, or the address that was not
 * found (for the list a person turns into rules).
 */
export async function resolveRedirect(
  deps: ResolveRedirectDeps,
  input: ResolveRedirectInput,
): Promise<RedirectResolution | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) return null;

  const address = readRequestedAddress(input.pathname, input.search);
  const { matcher } = await deps.ruleSets.forSite(input.tenantId, site.id);
  const chain = await followRedirects(
    {
      matcher,
      pagePath: async (pageGroupId, locale) =>
        (await pageTargetInfo(deps, input.tenantId, pageGroupId, locale))
          ?.path ?? null,
      answersAsPage: (path) => pageAnswersAt(deps, input.tenantId, site, path),
    },
    address,
  );

  switch (chain.kind) {
    case 'redirect':
      deps.traffic.recordHit({
        tenantId: input.tenantId,
        redirectId: chain.first.rule.id,
      });
      return {
        outcome: 'redirect',
        status: chain.status,
        location: redirectLocation(
          chain.location,
          input.search,
          chain.first.matchedQueryKeys,
        ),
      };
    case 'gone':
      deps.traffic.recordHit({
        tenantId: input.tenantId,
        redirectId: chain.first.rule.id,
      });
      return { outcome: 'gone' };
    case 'none':
    case 'broken':
    case 'loop': {
      // A rule that cannot be followed answers nothing, and the address is
      // as lost as if it had no rule: it is counted, so that it is seen.
      const missing = missingAddressOf(address);
      if (missing !== null) {
        deps.traffic.recordMiss({
          tenantId: input.tenantId,
          siteId: site.id,
          path: missing,
        });
      }
      return null;
    }
  }
}
