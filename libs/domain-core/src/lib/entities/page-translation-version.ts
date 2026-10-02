import type {
  FieldValueOverlay,
  PageContent,
  SeoMeta,
} from '@kometio/shared-types';

/**
 * An immutable snapshot of one language's own content at a point in time —
 * the second parallel versioning stream (see PageGroupVersion for the
 * shared structure).
 *
 * For a LINKED language that is its text over the shared structure
 * (`fieldValues`); for an unlinked one it is its own whole tree as well
 * (`divergedContent`), which until docs/adr/0075 had no history at all —
 * the comment here used to say it was versioned elsewhere, and it was not.
 */
export interface PageTranslationVersion {
  id: string;
  tenantId: string;
  pageTranslationId: string;
  fieldValues: FieldValueOverlay;
  seoMeta: SeoMeta;
  /** The language's own tree when the version was taken while it was unlinked — `null` while it followed the shared structure. */
  divergedContent: PageContent | null;
  createdBy: string | null;
  createdAt: Date;
}
