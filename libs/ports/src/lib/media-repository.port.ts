import type { Media } from '@kometio/domain-core';
import type { MediaKind } from '@kometio/shared-types';
import type { PaginatedResult, Pagination } from './pagination';

/**
 * What to narrow a site's library down to.
 *
 * Both parts are optional and both are answered by the database, not by
 * the caller: the library is paginated, so filtering the page that came
 * back would be a search that only ever looked at the newest twenty-four
 * files — and said nothing about the rest.
 */
export interface MediaFilter {
  /** Matched against the filename, case-insensitively, anywhere in it. */
  search?: string;
  /** One of the library's five kinds — see `mediaKindOfMime` for which MIME type belongs where. */
  kind?: MediaKind;
}

/**
 * Every method requires tenantId explicitly: no query can "forget" its
 * per-tenant scoping at the Port's signature level, even though the
 * concrete adapter also relies on RLS as a second barrier.
 */
export interface MediaRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(media: Media): Promise<void>;
  /** An existing one, written back — never created again: one deleted meanwhile is its "not found". */
  save(media: Media): Promise<void>;
  findById(tenantId: string, mediaId: string): Promise<Media | null>;
  listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filter?: MediaFilter,
  ): Promise<PaginatedResult<Media>>;
  /**
   * How many files of each kind a site has — what the library's folders
   * show before anybody opens one. One question to the database, not one
   * per folder.
   */
  countByKind(
    tenantId: string,
    siteId: string,
  ): Promise<Record<MediaKind, number>>;
  delete(tenantId: string, mediaId: string): Promise<void>;
}
