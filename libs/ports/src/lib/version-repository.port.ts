/**
 * Where the history of one thing is kept: an immutable snapshot per save of
 * a page's structure, of one language of it, of a reusable section, or of the
 * header or footer. They are all the same three questions, so there is one
 * port, and `PageGroupVersionRepositoryPort` and its siblings are what it is
 * called for each.
 *
 * Only the last `VERSION_HISTORY_LIMIT` versions of one owner are kept
 * (@kometio/domain-core): saving the next one drops the oldest.
 */
export interface VersionRepositoryPort<TVersion> {
  save(version: TVersion): Promise<void>;
  findById(tenantId: string, versionId: string): Promise<TVersion | null>;
  /** Every version kept of one owner (the page, the language, the section), oldest first. */
  listByOwner(tenantId: string, ownerId: string): Promise<TVersion[]>;
}
