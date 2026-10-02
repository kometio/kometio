import type { PageContent } from '@kometio/shared-types';

/**
 * An immutable snapshot of a PageGroup's SHARED structure at a point in
 * time — one of the new i18n model's two parallel versioning streams (the
 * other is PageTranslationVersion, for the per-locale text). The same
 * discipline as PageVersion: never a destructive overwrite, a new row for
 * every saveContent().
 */
export interface PageGroupVersion {
  id: string;
  tenantId: string;
  pageGroupId: string;
  content: PageContent;
  createdBy: string | null;
  createdAt: Date;
}
