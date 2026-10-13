import {
  InvalidRedirectError,
  LocaleNotEnabledError,
  PageGroupNotFoundError,
  type RedirectTarget,
  type Site,
} from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import { resolvePageGroupByPath } from '../use-cases/resolve-page-group-by-path';

/** Where a rule is asked to send, as it arrives: a page chosen, or an address typed. */
export type RedirectTargetInput =
  | { kind: 'page'; pageGroupId: string; locale: string }
  | { kind: 'url'; url: string };

export interface RedirectTargetDeps {
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

/**
 * What a target is stored as.
 *
 * A page chosen is checked to be one of this site's, in a language it
 * publishes. An address typed that is in fact a page of this site is stored
 * as the page: the address changes when the page is renamed or moved, and
 * the rule that was written for it must not break with it. That is the
 * difference between a redirect that works for a year and one that works
 * until somebody edits a slug.
 */
export async function toRedirectTarget(
  deps: RedirectTargetDeps,
  tenantId: string,
  site: Site,
  input: RedirectTargetInput,
): Promise<RedirectTarget> {
  if (input.kind === 'page') {
    if (!site.enabledLocales.includes(input.locale)) {
      throw new LocaleNotEnabledError(input.locale);
    }
    const group = await deps.pageGroupRepository.findById(
      tenantId,
      input.pageGroupId,
    );
    if (!group || group.siteId !== site.id) {
      throw new PageGroupNotFoundError(input.pageGroupId);
    }
    return {
      kind: 'page',
      pageGroupId: input.pageGroupId,
      locale: input.locale,
    };
  }

  const page = await pageAtAddress(deps, tenantId, site, input.url);
  return page ?? { kind: 'url', url: input.url };
}

/**
 * The page a plain path of this site names — `/en/blog/post` — or `null`.
 * Not for a pattern, not for an address with its own query or anchor, and
 * not for a path that is only where a page used to be (the page's own
 * redirect answers that).
 */
export async function pageAtAddress(
  deps: RedirectTargetDeps,
  tenantId: string,
  site: Site,
  address: string,
): Promise<Extract<RedirectTarget, { kind: 'page' }> | null> {
  let path = address.trim();
  // The site's own address, with its scheme, is a path of the site.
  const own = site.domain
    ? new RegExp(`^https?://(www\\.)?${escapeRegExp(site.domain)}(?=/|$)`, 'i')
    : null;
  if (own && own.test(path)) path = path.replace(own, '') || '/';
  if (!path.startsWith('/') || /[?#:*]/.test(path)) return null;

  const [locale, ...segments] = path
    .split('/')
    .filter((segment) => segment !== '');
  if (
    locale === undefined ||
    segments.length === 0 ||
    !site.enabledLocales.includes(locale)
  ) {
    return null;
  }
  const found = await resolvePageGroupByPath(
    deps,
    tenantId,
    site.id,
    locale,
    segments,
  );
  if (!found || found.moved) return null;
  return { kind: 'page', pageGroupId: found.group.id, locale };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A deployment that everybody signs in to (a public demo, docs/adr/0118) must
 * not hand out redirects to other sites: an address of the demo that sends a
 * visitor anywhere is an address anybody can lend to a phishing message. There
 * a rule may go to a page or a path of the site, and no further.
 *
 * Elsewhere the person who writes a rule is a publisher of the site, and
 * where its old address goes is theirs to say.
 */
export function assertTargetStaysOnSite(
  target: RedirectTarget | null,
  allowExternalTargets: boolean,
): void {
  if (allowExternalTargets || target?.kind !== 'url') return;
  if (/^https?:\/\//i.test(target.url)) {
    throw new InvalidRedirectError('target', 'external');
  }
}
