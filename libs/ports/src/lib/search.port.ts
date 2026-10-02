import type { PageTranslation } from '@kometio/domain-core';
import type { PageContent } from '@kometio/shared-types';

export interface PageSearchResult {
  pageId: string;
  slug: string;
  title: string;
  excerpt: string;
}

/**
 * Deliberately its own Port, not a method on PageTranslationRepositoryPort:
 * search is a distinct capability with its own storage/query shape (a
 * Postgres adapter today uses `tsvector`/GIN, a different engine — MariaDB
 * FULLTEXT, SQLite FTS5, MongoDB $text — would need none of
 * PageTranslationRepositoryPort's CRUD surface to implement it). Keeping the
 * two Ports separate means a future non-Postgres deployment can swap only
 * the search adapter without touching page persistence, or vice versa.
 */
export interface SearchPort {
  /**
   * (Re)indexes a translation's current searchable text — called after a
   * translation is published. Idempotent: re-indexing an already-indexed
   * translation just overwrites its entry. No separate `removeFromIndex`:
   * the index lives on the translation's own row in every adapter this
   * Port is expected to have (see PostgresSearchRepository), so deleting
   * the translation already removes it — a translation that was never
   * published is simply never indexed and never matches a search.
   */
  indexPage(
    tenantId: string,
    siteId: string,
    translation: PageTranslation,
    /**
     * The content to extract words from — the translation's published
     * snapshot with its `Section` blocks already expanded (docs/adr/0059).
     *
     * Passed in rather than read off `translation.publishedSnapshot`
     * inside the adapter, and required rather than optional: a snapshot
     * stores a REFERENCE where a section's words are, so an adapter
     * reading the snapshot directly would index a page as though the
     * section were not on it. Making it a parameter puts the decision at
     * the call site, where whoever adds the next caller has to answer it;
     * a default would let that caller silently index nothing.
     */
    content: PageContent,
  ): Promise<void>;

  /** Only ever matches published translations — an adapter must never surface draft content here. */
  search(
    tenantId: string,
    siteId: string,
    locale: string,
    query: string,
  ): Promise<PageSearchResult[]>;
}
