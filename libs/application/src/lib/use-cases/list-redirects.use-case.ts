import type { Redirect } from '@kometio/domain-core';
import type { PaginatedResult, RedirectListFilter } from '@kometio/ports';
import {
  pageTargetInfo,
  type PageTargetInfo,
} from '../redirects/published-page-path';
import type { RedirectDeps } from '../redirects/redirect-deps';

export type ListRedirectsDeps = Pick<
  RedirectDeps,
  'redirectRepository' | 'pageGroupRepository' | 'pageTranslationRepository'
>;

export interface ListRedirectsInput {
  tenantId: string;
  siteId: string;
  filter: RedirectListFilter;
  page: number;
  pageSize: number;
}

/** A rule, and what a person needs to read its target: the page's name and whether it answers. */
export interface RedirectListItem {
  redirect: Redirect;
  /** For a page target; `null` for an address, a gone, or a page that is not there. */
  page: PageTargetInfo | null;
}

/** What a person needs to read one rule by: the name of the page it goes to, and whether that page answers. */
export async function describeRedirect(
  deps: Pick<
    ListRedirectsDeps,
    'pageGroupRepository' | 'pageTranslationRepository'
  >,
  tenantId: string,
  redirect: Redirect,
): Promise<RedirectListItem> {
  const target = redirect.target;
  const page =
    target?.kind === 'page' && target.pageGroupId
      ? await pageTargetInfo(deps, tenantId, target.pageGroupId, target.locale)
      : null;
  return { redirect, page };
}

export async function listRedirects(
  deps: ListRedirectsDeps,
  input: ListRedirectsInput,
): Promise<PaginatedResult<RedirectListItem>> {
  const result = await deps.redirectRepository.listPage(
    input.tenantId,
    input.siteId,
    input.filter,
    { page: input.page, pageSize: input.pageSize },
  );
  const items = await Promise.all(
    result.items.map((redirect) =>
      describeRedirect(deps, input.tenantId, redirect),
    ),
  );
  return { items, total: result.total };
}
