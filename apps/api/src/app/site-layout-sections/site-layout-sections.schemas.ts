import { z } from 'zod';
import { SITE_LAYOUT_SECTION_KINDS } from '@kometio/shared-types';
import { sanitizedPageContentSchema } from '../rich-text/sanitized-page-content.schema';

export const siteLayoutSectionKindSchema = z.enum(SITE_LAYOUT_SECTION_KINDS);

export const getOrCreateQuerySchema = z.object({
  siteId: z.string().uuid(),
  locale: z.string().min(2),
  kind: siteLayoutSectionKindSchema,
});
export type GetOrCreateQuery = z.infer<typeof getOrCreateQuerySchema>;

export const saveDraftBodySchema = z.object({
  content: sanitizedPageContentSchema,
});
export type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;

export const rollbackBodySchema = z.object({
  versionId: z.string().uuid(),
});
export type RollbackBody = z.infer<typeof rollbackBodySchema>;

export const stickyBodySchema = z.object({
  sticky: z.boolean(),
});
export type StickyBody = z.infer<typeof stickyBodySchema>;
