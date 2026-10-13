import type { Redirect } from '@kometio/domain-core';
import type { RedirectOrigin, RedirectSource } from '@kometio/shared-types';
import type { PaginatedResult, Pagination } from './pagination';

export interface RedirectListFilter {
  /** Matched against the old address and a typed target, case-insensitively. */
  search?: string;
  origin?: RedirectOrigin;
  /** Only the rules that need a target again (the page they sent to is gone). */
  needsATarget?: boolean;
}

/**
 * Every method requires tenantId explicitly: no query can "forget" its
 * per-tenant scoping at the Port's signature level, even though the
 * concrete adapter also relies on RLS as a second barrier.
 */
export interface RedirectRepositoryPort {
  /** A new one. An address already ruled throws `RedirectSourceTakenError`. */
  add(redirect: Redirect): Promise<void>;
  /** An existing one, written back. One deleted meanwhile is `RedirectNotFoundError`; an address that is taken is `RedirectSourceTakenError`. */
  save(redirect: Redirect): Promise<void>;
  findById(tenantId: string, redirectId: string): Promise<Redirect | null>;
  findBySource(
    tenantId: string,
    siteId: string,
    source: RedirectSource,
  ): Promise<Redirect | null>;
  /**
   * Every rule of a site, which is what answering a request reads. Bounded
   * by the site's limit (`REDIRECT_LIMITS.rulesPerSite`), so it is one
   * query and not a page.
   */
  listBySite(tenantId: string, siteId: string): Promise<Redirect[]>;
  /** What the editor lists: most recently changed first. */
  listPage(
    tenantId: string,
    siteId: string,
    filter: RedirectListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Redirect>>;
  countBySite(tenantId: string, siteId: string): Promise<number>;
  delete(tenantId: string, redirectId: string): Promise<void>;
  /** Visits to add to the counts, as the ones counted since the last flush. A rule deleted meanwhile is not an error. */
  addHits(
    entries: readonly {
      tenantId: string;
      redirectId: string;
      hits: number;
      at: Date;
    }[],
  ): Promise<void>;
}
