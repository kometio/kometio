import { z } from 'zod';
import {
  localizedSeoMetaSchema,
  localizedTextSchema,
} from '@kometio/shared-types';

/**
 * A prefix and a slug both end up in a URL, so both are bounded and both
 * are re-derived server-side with `slugify` whatever arrives — the same
 * defense-in-depth a page's slug already gets. What is validated here is
 * the shape; what makes it a legal segment is the use case.
 */
const segmentSchema = z.string().trim().min(1).max(120);

export const listQuerySchema = z.object({ siteId: z.string().uuid() });
export type ListQuery = z.infer<typeof listQuerySchema>;

export const createTaxonomyBodySchema = z.object({
  siteId: z.string().uuid(),
  name: localizedTextSchema,
  /**
   * Three states, all meaningful: absent = derive one from the name,
   * `null` = mount the terms at the site root, a string = use this.
   * `.nullish()` rather than `.optional().nullable()` so the difference
   * survives to the use case, which is the only place that can tell the
   * second from the first.
   */
  prefix: segmentSchema.nullish(),
  hierarchical: z.boolean().optional(),
});
export type CreateTaxonomyBody = z.infer<typeof createTaxonomyBodySchema>;

export const updateTaxonomyBodySchema = z.object({
  name: localizedTextSchema.optional(),
  prefix: segmentSchema.nullish(),
  hierarchical: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateTaxonomyBody = z.infer<typeof updateTaxonomyBodySchema>;

export const createTermBodySchema = z.object({
  name: localizedTextSchema,
  /** Absent = derive one per language from the name. */
  slugs: z.record(z.string(), segmentSchema).optional(),
  parentId: z.string().uuid().nullish(),
});
export type CreateTermBody = z.infer<typeof createTermBodySchema>;

export const updateTermBodySchema = z.object({
  name: localizedTextSchema.optional(),
  description: localizedTextSchema.optional(),
  seoMeta: localizedSeoMetaSchema.optional(),
  noindex: z.boolean().optional(),
  /** Replaces the whole map: a language left out loses its address. */
  slugs: z.record(z.string(), segmentSchema).optional(),
  landingPageGroupId: z.string().uuid().nullish(),
  order: z.number().int().min(0).optional(),
});
export type UpdateTermBody = z.infer<typeof updateTermBodySchema>;

export const moveTermBodySchema = z.object({
  parentId: z.string().uuid().nullable(),
});
export type MoveTermBody = z.infer<typeof moveTermBodySchema>;

export const reorderTermsBodySchema = z.object({
  // Whose children are being put in order; `null` for the top of the dimension.
  parentId: z.string().uuid().nullable(),
  // The whole sibling group, in the order wanted. A duplicate is refused
  // here; one missing, or one that belongs elsewhere, by the use case.
  orderedTermIds: z.array(z.string().uuid()).min(1),
});
export type ReorderTermsBody = z.infer<typeof reorderTermsBodySchema>;

export const pageGroupTermsBodySchema = z.object({
  termIds: z.array(z.string().uuid()),
});
export type PageGroupTermsBody = z.infer<typeof pageGroupTermsBodySchema>;
