import {
  InvalidRedirectError,
  type Redirect,
  type Site,
} from '@kometio/domain-core';
import {
  compileRedirectMatcher,
  redirectQueryPairs,
  type RequestedAddress,
} from '@kometio/shared-types';
import { followRedirects } from './follow-redirects';
import { pageAnswersAt } from './page-answers';
import type { RedirectDeps } from './redirect-deps';
import { pageTargetInfo } from './published-page-path';

/** An address a rule would answer, with sample text where a pattern varies. */
function sampleAddress(rule: Redirect): RequestedAddress {
  return {
    path: rule.source.path
      .split('/')
      .map((segment) =>
        segment === '*' || segment.startsWith(':') ? 'sample' : segment,
      )
      .join('/'),
    params: new Map(redirectQueryPairs(rule.source.query)),
  };
}

/**
 * Refuses a rule that, with the others, sends a visitor round in a circle.
 *
 * Asked of the rule's own address, with the site's other rules and this one
 * in place of its previous self: A → B and B → A is two rules that are each
 * fine alone, and the second is the one refused.
 */
export async function assertNoLoop(
  deps: Pick<RedirectDeps, 'pageGroupRepository' | 'pageTranslationRepository'>,
  tenantId: string,
  site: Site,
  rule: Redirect,
  siteRules: readonly Redirect[],
): Promise<void> {
  if (rule.status === 410) return;
  const others = siteRules.filter((other) => other.id !== rule.id);
  const chain = await followRedirects(
    {
      matcher: compileRedirectMatcher([...others, rule]),
      pagePath: async (pageGroupId, locale) =>
        (await pageTargetInfo(deps, tenantId, pageGroupId, locale))?.path ??
        null,
      answersAsPage: (path) => pageAnswersAt(deps, tenantId, site, path),
    },
    sampleAddress(rule),
  );
  // Rules going round between them are refused. One pattern that matches its
  // own output (`/:year/:month/:slug` → `/en/blog/:slug` does) is not that: it
  // answers where its output is a page, and nothing where it is not.
  if (chain.kind === 'loop' && chain.rules.length > 1) {
    throw new InvalidRedirectError('target', 'loop');
  }
}
