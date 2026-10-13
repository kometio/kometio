import type { PaginatedResult, Pagination } from './pagination';

/** An address visitors asked for and the site did not have. */
export interface MissingPath {
  id: string;
  tenantId: string;
  siteId: string;
  path: string;
  hits: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  dismissed: boolean;
}

export interface MissingPathRepositoryPort {
  /**
   * Counts what was not found since the last flush. A site keeps at most
   * `MAX_MISSING_PATHS` addresses: past it, the ones asked for least and
   * longest ago go, so that a scanner trying a thousand paths cannot fill
   * the table.
   */
  record(
    entries: readonly {
      tenantId: string;
      siteId: string;
      path: string;
      hits: number;
      at: Date;
    }[],
  ): Promise<void>;
  /** Most asked for first. */
  list(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<MissingPath>>;
  /** Hides an address, and keeps it so that it does not come back as new. */
  dismiss(tenantId: string, missingPathId: string): Promise<void>;
  /** The address now has an answer. */
  clear(tenantId: string, siteId: string, path: string): Promise<void>;
}

/** What a site keeps of the addresses it did not have. */
export const MAX_MISSING_PATHS = 2000;

/**
 * What a site's table holds at most between two trims: it is cut back when it
 * is this much over `MAX_MISSING_PATHS`, not at every write. A read that wants
 * the whole list asks for this many.
 */
export const MAX_MISSING_PATHS_HELD = Math.ceil(MAX_MISSING_PATHS * 1.1);
