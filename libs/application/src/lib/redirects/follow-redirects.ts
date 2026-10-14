import type { Redirect } from '@kometio/domain-core';
import {
  fillRedirectTarget,
  readRequestedAddress,
  type RedirectMatch,
  type RedirectMatcher,
  type RequestedAddress,
} from '@kometio/shared-types';

/** A chain longer than this is a mistake the visitor should not pay for in round trips. */
export const MAX_REDIRECT_HOPS = 5;

export type RedirectChain =
  /** Nothing answers this address. */
  | { kind: 'none' }
  /** A rule answers, and the page it sends to is not there (deleted, or not published in that language). */
  | { kind: 'broken'; first: RedirectMatch<Redirect> }
  | { kind: 'gone'; first: RedirectMatch<Redirect> }
  /** `rules` are the distinct rules the chain went round: one is a pattern that matches its own output, which is no circle between rules. */
  | { kind: 'loop'; first: RedirectMatch<Redirect>; rules: string[] }
  | {
      kind: 'redirect';
      first: RedirectMatch<Redirect>;
      /** Where the last rule of the chain sends, before the request's query is carried over. */
      location: string;
      /** 302 if any rule of the chain says so: a temporary step makes the whole answer temporary. */
      status: 301 | 302;
    };

export interface FollowDeps {
  matcher: RedirectMatcher<Redirect>;
  /** Where a page answers, or `null` when it does not. */
  pagePath(pageGroupId: string, locale: string): Promise<string | null>;
  /**
   * Whether a page of the site answers at this path of the site. A chain is
   * not followed into one: the site serves it, and a rule that happens to
   * match its address (a broad pattern does) is only asked where nothing
   * answers.
   */
  answersAsPage(path: string): Promise<boolean>;
}

/**
 * Which rule answers an address and where the visitor ends up, in ONE
 * redirect: a rule whose target is itself ruled is followed here, so that a
 * person who moved a page twice sends visitors to where it is now and not
 * through two stops (which a search engine counts against the first).
 *
 * A loop is no answer. It is also what a rule is refused for when it is
 * written, by asking the same question of the address it takes.
 */
export async function followRedirects(
  deps: FollowDeps,
  address: RequestedAddress,
): Promise<RedirectChain> {
  const found = deps.matcher.match(address);
  if (!found) return { kind: 'none' };
  const first: RedirectMatch<Redirect> = found;

  const seen = new Set<string>();
  let match = first;
  let location: string | null = null;
  let status: 301 | 302 = 301;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const rule = match.rule;
    if (seen.has(rule.id)) return { kind: 'loop', first, rules: [...seen] };
    seen.add(rule.id);

    if (rule.status === 410) return { kind: 'gone', first };
    if (rule.status === 302) status = 302;

    const target = rule.target;
    if (!target) return { kind: 'gone', first };
    let next: string | null;
    if (target.kind === 'page') {
      next = target.pageGroupId
        ? await deps.pagePath(target.pageGroupId, target.locale)
        : null;
    } else {
      next = fillRedirectTarget(target.url, match);
    }
    if (next === null) {
      // The first rule is broken: it answers nothing. A later one: the
      // chain stops where it had got to.
      return location === null ? { kind: 'broken', first } : done();
    }
    location = next;

    // Another site's address ends the chain: its rules are not ours.
    if (!next.startsWith('/')) break;
    const [path = '', search = ''] = next.split('#')[0]?.split('?') ?? [];
    const following = deps.matcher.match(
      readRequestedAddress(path, search === '' ? '' : `?${search}`),
    );
    if (!following) break;
    if (await deps.answersAsPage(path)) break;
    match = following;
  }
  return done();

  function done(): RedirectChain {
    return location === null
      ? { kind: 'broken', first }
      : { kind: 'redirect', first, location, status };
  }
}
