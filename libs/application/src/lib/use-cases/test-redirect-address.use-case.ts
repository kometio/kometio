import type { Redirect } from '@kometio/domain-core';
import { readRequestedAddress, redirectLocation } from '@kometio/shared-types';
import { followRedirects } from '../redirects/follow-redirects';
import { pageAnswersAt } from '../redirects/page-answers';
import { pageTargetInfo } from '../redirects/published-page-path';
import type { RedirectDeps } from '../redirects/redirect-deps';
import { resolvePageGroupByPath } from './resolve-page-group-by-path';
import { requireSite } from './require-site';

export type TestRedirectAddressDeps = Pick<
  RedirectDeps,
  | 'siteRepository'
  | 'pageGroupRepository'
  | 'pageTranslationRepository'
  | 'ruleSets'
>;

export interface TestRedirectAddressInput {
  tenantId: string;
  siteId: string;
  /** A whole link, a path, or `?p=123`, as a person pastes it. */
  address: string;
}

export type RedirectTestResult =
  /** A page answers at this address, so no rule is asked: a page always wins. */
  | { outcome: 'page'; path: string }
  /** The page answered here and has moved; the site sends to where it is now. */
  | { outcome: 'moved'; location: string }
  | {
      outcome: 'redirect';
      status: 301 | 302;
      location: string;
      rule: Redirect;
    }
  | { outcome: 'gone'; rule: Redirect }
  /** A rule answers, and the page it sends to is not published (or not there). */
  | { outcome: 'broken'; rule: Redirect }
  | { outcome: 'loop'; rule: Redirect }
  | { outcome: 'none' };

/**
 * What a visitor who asked for this address would get — the same answer the
 * site gives, from the same rules, so that "I added it and it does not work"
 * has a reason a person can read.
 */
export async function testRedirectAddress(
  deps: TestRedirectAddressDeps,
  input: TestRedirectAddressInput,
): Promise<RedirectTestResult> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  let pathname = '/';
  let search = '';
  try {
    const raw = input.address.trim();
    const url = new URL(
      /^https?:\/\//i.test(raw)
        ? raw
        : raw.startsWith('/') || raw.startsWith('?')
          ? raw
          : `/${raw}`,
      'https://address.invalid',
    );
    pathname = url.pathname;
    search = url.search;
  } catch {
    return { outcome: 'none' };
  }
  const address = readRequestedAddress(pathname, search);

  // A page first, as the site does: it asks its routes, and a rule only
  // where they have nothing.
  const segments = address.path.split('/').filter(Boolean);
  const [locale, ...rest] = segments;
  if (locale !== undefined && site.enabledLocales.includes(locale)) {
    if (rest.length === 0) return { outcome: 'page', path: `/${locale}` };
    const found = await resolvePageGroupByPath(
      deps,
      input.tenantId,
      site.id,
      locale,
      rest,
    );
    if (found && found.translation.status === 'published') {
      const where = `/${[locale, ...found.currentPath].join('/')}`;
      return found.moved
        ? { outcome: 'moved', location: where }
        : { outcome: 'page', path: where };
    }
  }

  const { matcher } = await deps.ruleSets.forSite(input.tenantId, site.id);
  const chain = await followRedirects(
    {
      matcher,
      pagePath: async (pageGroupId, loc) =>
        (await pageTargetInfo(deps, input.tenantId, pageGroupId, loc))?.path ??
        null,
      answersAsPage: (path) => pageAnswersAt(deps, input.tenantId, site, path),
    },
    address,
  );
  switch (chain.kind) {
    case 'none':
      return { outcome: 'none' };
    case 'gone':
      return { outcome: 'gone', rule: chain.first.rule };
    case 'broken':
      return { outcome: 'broken', rule: chain.first.rule };
    case 'loop':
      return { outcome: 'loop', rule: chain.first.rule };
    case 'redirect':
      return {
        outcome: 'redirect',
        status: chain.status,
        location: redirectLocation(
          chain.location,
          search,
          chain.first.matchedQueryKeys,
        ),
        rule: chain.first.rule,
      };
  }
}
