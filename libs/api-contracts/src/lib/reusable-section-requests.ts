import { z } from 'zod';
import {
  exposedFieldsSchema,
  pageContentSchema,
  reusableSectionKindSchema,
} from '@kometio/shared-types';

/**
 * A name is shown in the insert menu and in the editor's title bar, never
 * interpolated into markup or a selector — but it is still bounded here,
 * because "whatever the client sent" is not a length any UI was designed
 * for.
 */
export const reusableSectionNameSchema = z.string().trim().min(1).max(120);

export const listReusableSectionsQuerySchema = z.object({
  siteId: z.string().uuid(),
});
export type ListReusableSectionsQuery = z.infer<
  typeof listReusableSectionsQuerySchema
>;

/**
 * The two bodies that carry block content are `*BodyShape`, not
 * `*BodySchema`, on purpose: what a client sends, with the content as the
 * shared schema reads it. The API accepts them only through its own
 * `*BodySchema`, which has the content pass the sanitiser (ADR-0046), so a
 * controller that reached for the shape by mistake has no schema of that
 * name to reach for.
 */
export const createReusableSectionBodyShape = z.object({
  siteId: z.string().uuid(),
  name: reusableSectionNameSchema,
  kind: reusableSectionKindSchema,
  // Present when the section is made out of blocks already on a page.
  content: pageContentSchema.optional(),
});
export type CreateReusableSectionBody = z.infer<
  typeof createReusableSectionBodyShape
>;

export const saveReusableSectionDraftBodyShape = z.object({
  content: pageContentSchema,
});
export type SaveReusableSectionDraftBody = z.infer<
  typeof saveReusableSectionDraftBodyShape
>;

export const renameReusableSectionBodySchema = z.object({
  name: reusableSectionNameSchema,
});
export type RenameReusableSectionBody = z.infer<
  typeof renameReusableSectionBodySchema
>;

export const setReusableSectionExposedFieldsBodySchema = z.object({
  exposedFields: exposedFieldsSchema,
});
export type SetReusableSectionExposedFieldsBody = z.infer<
  typeof setReusableSectionExposedFieldsBodySchema
>;

export const rollbackReusableSectionBodySchema = z.object({
  versionId: z.string().uuid(),
});
export type RollbackReusableSectionBody = z.infer<
  typeof rollbackReusableSectionBodySchema
>;
