import type { PageContent } from '@kometio/shared-types';

/**
 * An immutable snapshot of a SiteLayoutSection's content at a point in
 * time. Every save (create, saveDraft, rollback) creates a new row — never
 * a destructive overwrite, the same invariant as
 * PageVersion/SiteLayoutSection.restoreContent().
 */
export interface SiteLayoutSectionVersion {
  id: string;
  tenantId: string;
  siteLayoutSectionId: string;
  content: PageContent;
  createdBy: string | null;
  createdAt: Date;
}
