import type { PageContent } from '@kometio/shared-types';

/**
 * An immutable snapshot of a ReusableSection's content. Every save
 * (create, saveDraft, rollback) writes one — never a destructive
 * overwrite, the same invariant the page and layout-section versions hold.
 */
export interface ReusableSectionVersion {
  id: string;
  tenantId: string;
  reusableSectionId: string;
  content: PageContent;
  createdBy: string | null;
  createdAt: Date;
}
