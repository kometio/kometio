import { z } from 'zod';
import {
  blockSchema,
  fieldValueOverlaySchema,
  pageStatusSchema,
  seoMetaSchema,
} from '@kometio/shared-types';

/** One translation, projected down to what a page-groups list row's locale badge needs — see pageGroupListItemSchema. */
export const pageGroupListItemTranslationSchema = z.object({
  locale: z.string(),
  slug: z.string(),
  title: z.string(),
  status: pageStatusSchema,
  isDiverged: z.boolean(),
  /** Published, but the draft has moved on since — the rule lives in @kometio/domain-core's hasUnpublishedChanges, never re-derived on the client. */
  hasUnpublishedChanges: z.boolean(),
});

export type PageGroupListItemTranslation = z.infer<
  typeof pageGroupListItemTranslationSchema
>;

/** `GET /page-groups` (the editor's pages list) — one row per PageGroup, every locale's translation summarized for the row's availability badges. */
export const pageGroupListItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  parentId: z.string().nullable(),
  order: z.number(),
  /** Which section of the editor lists this page, or null for a page. */
  collectionId: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The last change to this page in ANY language, and who made it — resolved server-side to a name, same reasoning as createdByName. */
  lastEditedAt: z.string(),
  lastEditedByName: z.string().nullable(),
  /** How many pages hang directly under this one, whatever the list is filtered to. */
  childCount: z.number().int(),
  translations: z.array(pageGroupListItemTranslationSchema),
});

export type PageGroupListItemRecord = z.infer<typeof pageGroupListItemSchema>;

export const paginatedPageGroupsSchema = z.object({
  items: z.array(pageGroupListItemSchema),
  total: z.number(),
});

export type PaginatedPageGroups = z.infer<typeof paginatedPageGroupsSchema>;

/**
 * The wire shape of the `PageGroup` domain entity (`libs/domain-core`):
 * field-level i18n, where this half carries the structure every language
 * shares — see docs/adr/0034.
 *
 * It was written to sit beside the duplicated-page model's own shape
 * during the migration away from it; that migration is done, and those
 * schemas have been deleted.
 */
export const pageGroupRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  parentId: z.string().nullable(),
  order: z.number(),
  /** Which section of the editor lists this page — the editor needs it to know where "back" goes. */
  collectionId: z.string().nullable(),
  content: z.array(blockSchema),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PageGroupRecord = z.infer<typeof pageGroupRecordSchema>;

/** The wire shape of the `PageTranslation` domain entity — see `pageGroupRecordSchema` above for the context of its coexistence with the old model. */
export const pageTranslationRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  pageGroupId: z.string(),
  locale: z.string(),
  slug: z.string(),
  seoMeta: seoMetaSchema,
  fieldValues: fieldValueOverlaySchema,
  status: pageStatusSchema,
  publishedSnapshot: z.array(blockSchema).nullable(),
  isDiverged: z.boolean(),
  divergedContent: z.array(blockSchema).nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PageTranslationRecord = z.infer<typeof pageTranslationRecordSchema>;

/** `GET /page-groups/:id/versions` — mirrors `PageGroupVersion` (libs/domain-core). */
export const pageGroupVersionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  pageGroupId: z.string(),
  content: z.array(blockSchema),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export type PageGroupVersionRecord = z.infer<
  typeof pageGroupVersionRecordSchema
>;

/** `GET /page-translations/:id/versions` — mirrors `PageTranslationVersion` (libs/domain-core). */
export const pageTranslationVersionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  pageTranslationId: z.string(),
  fieldValues: fieldValueOverlaySchema,
  seoMeta: seoMetaSchema,
  /** Set when the version was taken while the language was unlinked — see `PageTranslationVersion`. */
  divergedContent: z.array(blockSchema).nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export type PageTranslationVersionRecord = z.infer<
  typeof pageTranslationVersionRecordSchema
>;
