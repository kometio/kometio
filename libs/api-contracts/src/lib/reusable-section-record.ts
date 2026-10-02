import { z } from 'zod';
import {
  exposedFieldsSchema,
  pageContentSchema,
  REUSABLE_SECTION_STATUSES,
  reusableSectionKindSchema,
} from '@kometio/shared-types';

/** A reusable section as every `/reusable-sections` response that carries one does (docs/adr/0026). */
export const reusableSectionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  name: z.string(),
  kind: reusableSectionKindSchema,
  status: z.enum(REUSABLE_SECTION_STATUSES),
  content: pageContentSchema,
  publishedContent: pageContentSchema.nullable(),
  exposedFields: exposedFieldsSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReusableSectionRecord = z.infer<typeof reusableSectionRecordSchema>;

/**
 * A row of `GET /reusable-sections` — the section, plus where it is used.
 * The counts travel with the row: the list always shows them, and a second
 * call would let the name and the count disagree on screen.
 */
export const reusableSectionListItemSchema = reusableSectionRecordSchema.extend(
  {
    usedOnPages: z.number().int().nonnegative(),
    usedInTemplates: z.number().int().nonnegative(),
  },
);

export type ReusableSectionListItem = z.infer<
  typeof reusableSectionListItemSchema
>;

/** One saved state of a section — `GET /reusable-sections/:id/versions`. */
export const reusableSectionVersionRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  reusableSectionId: z.string(),
  content: pageContentSchema,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export type ReusableSectionVersionRecord = z.infer<
  typeof reusableSectionVersionRecordSchema
>;
