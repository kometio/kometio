import { z } from 'zod';
import {
  pageContentSchema,
  SITE_LAYOUT_SECTION_KINDS,
  SITE_LAYOUT_SECTION_STATUSES,
} from '@kometio/shared-types';

/** A header or footer as every `/site-layout-sections` response carries it (docs/adr/0026). */
export const siteLayoutSectionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  locale: z.string(),
  kind: z.enum(SITE_LAYOUT_SECTION_KINDS),
  status: z.enum(SITE_LAYOUT_SECTION_STATUSES),
  content: pageContentSchema,
  publishedContent: pageContentSchema.nullable(),
  sticky: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SiteLayoutSectionRecord = z.infer<
  typeof siteLayoutSectionRecordSchema
>;

/** One saved state of a header or footer — `GET /site-layout-sections/:id/versions`. */
export const siteLayoutSectionVersionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteLayoutSectionId: z.string(),
  content: pageContentSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export type SiteLayoutSectionVersionRecord = z.infer<
  typeof siteLayoutSectionVersionRecordSchema
>;
