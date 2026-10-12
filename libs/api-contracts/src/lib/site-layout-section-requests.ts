import { z } from 'zod';
import {
  pageContentSchema,
  SITE_LAYOUT_SECTION_KINDS,
} from '@kometio/shared-types';

export const siteLayoutSectionKindSchema = z.enum(SITE_LAYOUT_SECTION_KINDS);

export const getOrCreateSiteLayoutSectionQuerySchema = z.object({
  siteId: z.string().uuid(),
  locale: z.string().min(2),
  kind: siteLayoutSectionKindSchema,
});
export type GetOrCreateSiteLayoutSectionQuery = z.infer<
  typeof getOrCreateSiteLayoutSectionQuerySchema
>;

/** `*BodyShape`, not `*BodySchema`: see reusable-section-requests.ts. */
export const saveSiteLayoutSectionDraftBodyShape = z.object({
  content: pageContentSchema,
});
export type SaveSiteLayoutSectionDraftBody = z.infer<
  typeof saveSiteLayoutSectionDraftBodyShape
>;

export const rollbackSiteLayoutSectionBodySchema = z.object({
  versionId: z.string().uuid(),
});
export type RollbackSiteLayoutSectionBody = z.infer<
  typeof rollbackSiteLayoutSectionBodySchema
>;

export const setSiteLayoutSectionStickyBodySchema = z.object({
  sticky: z.boolean(),
});
export type SetSiteLayoutSectionStickyBody = z.infer<
  typeof setSiteLayoutSectionStickyBodySchema
>;
