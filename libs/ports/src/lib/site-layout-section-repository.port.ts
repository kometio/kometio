import type {
  SiteLayoutSection,
  SiteLayoutSectionKind,
} from '@kometio/domain-core';

/**
 * Every method requires tenantId explicitly, the same principle as
 * PageRepositoryPort. No `delete`/`list`: there is no UX today for "delete
 * the header" — that gets added if and when it is genuinely needed (YAGNI).
 */
export interface SiteLayoutSectionRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(section: SiteLayoutSection): Promise<void>;
  /** An existing one, written back — never created again: one deleted meanwhile is its "not found". */
  save(section: SiteLayoutSection): Promise<void>;
  findById(tenantId: string, id: string): Promise<SiteLayoutSection | null>;
  findBySiteLocaleKind(
    tenantId: string,
    siteId: string,
    locale: string,
    kind: SiteLayoutSectionKind,
  ): Promise<SiteLayoutSection | null>;
}
