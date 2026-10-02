import { z } from 'zod';
import {
  fieldValueOverlaySchema,
  pageListStateSchema,
  seoMetaSchema,
} from '@kometio/shared-types';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';
import { pageSlugSchema } from './page-slug.schemas';
import { reusableSectionNameSchema } from '../reusable-sections/reusable-sections.schemas';

// Fase 4's pages-list view — every filter optional, an absent one just
// doesn't narrow the query (see DrizzlePageGroupRepository.listBySiteFiltered).
export const listPageGroupsQuerySchema = z.object({
  siteId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  createdBy: z.string().uuid().optional(),
  locale: z.string().min(2).optional(),
  // Three answers, not two: absent asks for every page wherever it is
  // filed, 'none' for the ones that belong to no section (the Pages
  // screen), an id for one section's own screen. A literal rather than a
  // nullable uuid because a query string has no null to send.
  collection: z.union([z.literal('none'), z.string().uuid()]).optional(),
  // Leaves out this page and its whole subtree — what the parent picker
  // asks for, since a page cannot move inside its own child (ADR-0074).
  excludeSubtreeOf: z.string().uuid().optional(),
  // Nothing of it online, online as written, or online with the draft moved
  // on — judged by the language the row shows (see PageGroupStatusFilter).
  status: pageListStateSchema.optional(),
});
export type ListPageGroupsQuery = z.infer<typeof listPageGroupsQuerySchema>;

export const createPageGroupTranslationBodySchema = z.object({
  // Which languages exist is the site's to say (Site.assertLocaleEnabled);
  // this only keeps a request from carrying a novel as one.
  locale: z.string().min(2).max(35),
  slug: pageSlugSchema,
  seoMeta: seoMetaSchema,
});
export type CreatePageGroupTranslationBody = z.infer<
  typeof createPageGroupTranslationBodySchema
>;

export const createPageGroupBodySchema = z
  .object({
    siteId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    collectionId: z.string().uuid().nullable().optional(),
    content: sanitizedPageContentSchema.optional(),
    /** Start from a copy of this template's published blocks (docs/adr/0072). */
    templateId: z.string().uuid().optional(),
    /**
     * The page's first language, written in the same transaction as the
     * page (docs/adr/0072). Without it the page is created alone and the
     * language added by a second request — which, refused, used to leave a
     * page with no language behind.
     */
    translation: createPageGroupTranslationBodySchema.optional(),
  })
  // Two answers to "what does the page start with" in one request would
  // leave the server to pick one of them silently.
  .refine((body) => !(body.templateId && body.content), {
    message: 'Send either content or templateId, not both',
    path: ['templateId'],
  })
  // A page started from a template is always created with its language:
  // the two-request way is the one that could leave half a page behind,
  // and a feature this new has no caller that needs it.
  .refine((body) => !body.templateId || body.translation, {
    message: 'A page started from a template needs its first translation',
    path: ['translation'],
  });
export type CreatePageGroupBody = z.infer<typeof createPageGroupBodySchema>;

export const saveAsTemplateBodySchema = z.object({
  name: reusableSectionNameSchema,
});
export type SaveAsTemplateBody = z.infer<typeof saveAsTemplateBodySchema>;

export const moveToCollectionBodySchema = z.object({
  collectionId: z.string().uuid().nullable(),
});
export type MoveToCollectionBody = z.infer<typeof moveToCollectionBodySchema>;

/** `null` moves the page back among the site's top-level pages (docs/adr/0074). */
export const moveToParentBodySchema = z.object({
  parentId: z.string().uuid().nullable(),
});
export type MoveToParentBody = z.infer<typeof moveToParentBodySchema>;

export const savePageGroupContentBodySchema = z.object({
  content: sanitizedPageContentSchema,
});
export type SavePageGroupContentBody = z.infer<
  typeof savePageGroupContentBodySchema
>;

export const savePageTranslationFieldValuesBodySchema = z.object({
  fieldValues: fieldValueOverlaySchema,
});
export type SavePageTranslationFieldValuesBody = z.infer<
  typeof savePageTranslationFieldValuesBodySchema
>;

export const saveDivergedPageTranslationContentBodySchema = z.object({
  content: sanitizedPageContentSchema,
});
export type SaveDivergedPageTranslationContentBody = z.infer<
  typeof saveDivergedPageTranslationContentBodySchema
>;

/**
 * The fork's text as an overlay, computed by the editor — see
 * relinkPageTranslation for why the API does not compute it itself.
 */
export const relinkPageTranslationBodySchema = z.object({
  fieldValues: fieldValueOverlaySchema,
});
export type RelinkPageTranslationBody = z.infer<
  typeof relinkPageTranslationBodySchema
>;

export const updatePageTranslationSeoMetaBodySchema = z.object({
  seoMeta: seoMetaSchema,
});
export type UpdatePageTranslationSeoMetaBody = z.infer<
  typeof updatePageTranslationSeoMetaBodySchema
>;

/**
 * `pageSlugSchema` and not a bare string: this decides an address, and
 * the same rules that governed it at creation govern every rename.
 */
export const renamePageTranslationBodySchema = z.object({
  slug: pageSlugSchema,
  parentGroupId: z.string().uuid().nullable(),
});
export type RenamePageTranslationBody = z.infer<
  typeof renamePageTranslationBodySchema
>;

/** Restoring a version, of the shared structure or of one language alike. */
export const rollbackToVersionBodySchema = z.object({
  versionId: z.string().uuid(),
});
export type RollbackToVersionBody = z.infer<typeof rollbackToVersionBodySchema>;

export const reorderPageGroupsBodySchema = z.object({
  siteId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  orderedPageGroupIds: z.array(z.string().uuid()).min(1),
});
export type ReorderPageGroupsBody = z.infer<typeof reorderPageGroupsBodySchema>;
