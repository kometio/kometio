import { z } from 'zod';
import {
  localizedSeoMetaSchema,
  localizedTextSchema,
} from '@kometio/shared-types';

/**
 * One dimension a site classifies things along — "Category", "Family",
 * "Tag" — as every `/taxonomies` response carries it (docs/adr/0026).
 * Deliberately not tied to any entity: pages carry terms today and
 * products will carry the same terms later, on the same tables
 * (ADR-0064).
 */
export const taxonomyRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  /**
   * The URL prefix its terms live under (`/it/<prefix>/<termSlug>`), or
   * `null` for terms that answer at the site root (`/it/<termSlug>`) — the
   * "pretty URL" case, which is also the one that can collide with a root
   * page's slug.
   */
  prefix: z.string().nullable(),
  name: localizedTextSchema,
  /** Whether terms may nest. A flat dimension ("Tag") says false, and the editor then offers no parent. */
  hierarchical: z.boolean(),
  order: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TaxonomyRecord = z.infer<typeof taxonomyRecordSchema>;

/**
 * One value inside a dimension — "Espresso machines" inside "Category".
 *
 * `slugs` is separate from the rest for a database reason, not a
 * modelling one: a slug is what a URL is built from, and Postgres cannot
 * enforce "unique per locale" over a JSON map whose keys are whatever
 * languages the site happens to have. See ADR-0064.
 */
export const termRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  taxonomyId: z.string(),
  parentId: z.string().nullable(),
  name: localizedTextSchema,
  /** The introductory text the default term layout shows — not the meta description, which lives in `seoMeta`. */
  description: localizedTextSchema,
  seoMeta: localizedSeoMetaSchema,
  /** Kept out of search engines on purpose, by whoever publishes (docs/adr/0078). */
  noindex: z.boolean(),
  /**
   * A page built by hand that is rendered ON the term's own URL instead
   * of the default layout — never a redirect, so unlinking or deleting
   * it leaves the URL working (ADR-0064).
   */
  landingPageGroupId: z.string().nullable(),
  order: z.number().int(),
  /** locale -> the slug that term answers to in that language. */
  slugs: z.record(z.string(), z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TermRecord = z.infer<typeof termRecordSchema>;

/** `GET`/`PATCH /page-groups/:id/terms` — the terms a page is filed under. */
export const pageGroupTermsSchema = z.object({ termIds: z.array(z.string()) });

export type PageGroupTerms = z.infer<typeof pageGroupTermsSchema>;
