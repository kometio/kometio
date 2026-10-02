import type { Collection } from '@kometio/domain-core';

/**
 * The editor's own sections — News, Events, Case studies.
 *
 * A port of its own rather than a corner of the page repository: a
 * collection holds no content and knows nothing about pages. What binds
 * them is a nullable column on the page, read and written by the page's
 * own repository, so nothing here has to reach across.
 *
 * Every method takes `tenantId` explicitly, like every other repository
 * here: the database policy is the second barrier, not the first
 * (docs/adr/0002).
 */
export interface CollectionRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(collection: Collection): Promise<void>;
  /** An existing one, written back — never created again: one deleted meanwhile is its "not found". */
  save(collection: Collection): Promise<void>;
  findById(tenantId: string, id: string): Promise<Collection | null>;
  listBySite(tenantId: string, siteId: string): Promise<Collection[]>;
  /**
   * Removes the section. The pages it held stay, and become ordinary
   * pages again — the column that pointed here is `on delete set null`,
   * because deleting a section must never delete what was in it.
   */
  delete(tenantId: string, id: string): Promise<void>;
}
