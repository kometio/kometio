import { z } from 'zod';
import { siteDomainSchema } from '@kometio/shared-types';
import { pagePathSchema, pageSlugSchema } from '../pages/page-slug.schemas';

export const publicPageBySlugQuerySchema = z.object({
  domain: siteDomainSchema,
  // Caller-supplied (from the URL's locale prefix, docs/adr/0017) rather
  // than always resolved to the site's own defaultLocale.
  locale: z.string().min(2),
  path: pagePathSchema,
});
export type PublicPageBySlugQuery = z.infer<typeof publicPageBySlugQuerySchema>;

/**
 * A term answers at one or two segments — `{prefix}/{slug}`, or just
 * `{slug}` for a dimension mounted at the site root (docs/adr/0064). The
 * bound is the shape of the address, not a limit: a term's path never
 * carries its ancestors.
 */
export const publicTermByPathQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
  path: pagePathSchema.refine((segments) => segments.length <= 2, {
    message: 'a term path is at most two segments',
  }),
});
export type PublicTermByPathQuery = z.infer<typeof publicTermByPathQuerySchema>;

/** An author's page: `/{locale}/{word for author}/{slug}` — the word is the site's business, the slug is the person. */
export const publicAuthorBySlugQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
  slug: pageSlugSchema,
});
export type PublicAuthorBySlugQuery = z.infer<
  typeof publicAuthorBySlugQuerySchema
>;

export const publicPagesSitemapQuerySchema = z.object({
  domain: siteDomainSchema,
});
export type PublicPagesSitemapQuery = z.infer<
  typeof publicPagesSitemapQuerySchema
>;

export const publicPagesFeedQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
  /** One term's feed rather than the whole site's — the slug it answers at in this language. */
  term: z.string().trim().min(1).optional(),
  /** Coerced, because a query string has only strings in it. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PublicPagesFeedQuery = z.infer<typeof publicPagesFeedQuerySchema>;

export const publicPagesSearchQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
  // A whitespace-only query would reach plainto_tsquery as an effectively
  // empty tsquery — reject it here rather than let the adapter special-case it.
  q: z.string().trim().min(1),
});
export type PublicPagesSearchQuery = z.infer<
  typeof publicPagesSearchQuerySchema
>;

export const publicPagesChromeQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
});
export type PublicPagesChromeQuery = z.infer<
  typeof publicPagesChromeQuerySchema
>;

export const publicPagesTreeQuerySchema = z.object({
  domain: siteDomainSchema,
  locale: z.string().min(2),
});
export type PublicPagesTreeQuery = z.infer<typeof publicPagesTreeQuerySchema>;

export const publicPagePreviewQuerySchema = z.object({
  token: z.string().min(1),
});
export type PublicPagePreviewQuery = z.infer<
  typeof publicPagePreviewQuerySchema
>;

/** A section has no locale of its own — the caller says which one its links resolve in. */
export const publicSectionPreviewQuerySchema = z.object({
  token: z.string().min(1),
  locale: z.string().min(2),
});
export type PublicSectionPreviewQuery = z.infer<
  typeof publicSectionPreviewQuerySchema
>;
