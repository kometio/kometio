import { z } from 'zod';
import {
  exposedFieldsSchema,
  reusableSectionKindSchema,
} from '@kometio/shared-types';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';

/**
 * A name is shown in the insert menu and in the editor's title bar, never
 * interpolated into markup or a selector — but it is still bounded here,
 * because "whatever the client sent" is not a length any UI was designed
 * for.
 */
export const reusableSectionNameSchema = z.string().trim().min(1).max(120);

export const listQuerySchema = z.object({ siteId: z.string().uuid() });
export type ListQuery = z.infer<typeof listQuerySchema>;

export const createBodySchema = z.object({
  siteId: z.string().uuid(),
  name: reusableSectionNameSchema,
  kind: reusableSectionKindSchema,
  // Present when the section is made out of blocks already on a page.
  content: sanitizedPageContentSchema.optional(),
});
export type CreateBody = z.infer<typeof createBodySchema>;

export const saveDraftBodySchema = z.object({
  content: sanitizedPageContentSchema,
});
export type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;

export const renameBodySchema = z.object({ name: reusableSectionNameSchema });
export type RenameBody = z.infer<typeof renameBodySchema>;

export const exposedFieldsBodySchema = z.object({
  exposedFields: exposedFieldsSchema,
});
export type ExposedFieldsBody = z.infer<typeof exposedFieldsBodySchema>;

export const rollbackBodySchema = z.object({ versionId: z.string().uuid() });
export type RollbackBody = z.infer<typeof rollbackBodySchema>;
