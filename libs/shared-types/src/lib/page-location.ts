import { z } from 'zod';

/**
 * An address a page's language answered to under a parent it has since
 * left: the parent it hung from, and the slug it had while it hung there.
 *
 * Both halves are the unit. Public resolution walks a path segment by
 * segment, asking each parent for a child with that slug (see
 * `resolvePageGroupByPath`), so "who used to live here?" is a question
 * about the pair: the same slug under a different parent is a different
 * page.
 *
 * Shared rather than declared in `@kometio/domain-core` because the row it
 * is stored in is declared in `@kometio/postgres-db`, which takes its data
 * shapes from here (docs/adr/0074).
 */
export const formerParentLocationSchema = z.object({
  parentGroupId: z.string().nullable(),
  slug: z.string(),
});
export type FormerParentLocation = z.infer<typeof formerParentLocationSchema>;
