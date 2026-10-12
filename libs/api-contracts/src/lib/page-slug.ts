import { z } from 'zod';
import { isCanonicalSlug, PAGE_SLUG_MAX_LENGTH } from '@kometio/shared-types';

// Never trust a client-computed slug: re-derive it with the same slugify()
// the frontend uses for its live preview, and reject anything that isn't
// already in that canonical form — one source of truth for "valid slug"
// instead of a regex that could drift out of sync with slugify's rules.
export const pageSlugSchema = z
  .string()
  .min(1)
  .max(PAGE_SLUG_MAX_LENGTH)
  .refine(isCanonicalSlug, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated',
  });

// A full URL path, root to leaf (e.g. "servizi/idraulica") — sibling-scoped
// slug uniqueness (schema.ts's page_translations unique constraints) means
// resolving a public page needs the whole path, not just the trailing slug
// alone (see resolvePageGroupByPath). Each segment validated the same way a
// single slug is.
export const pagePathSchema = z
  .string()
  .min(1)
  .transform((path) => path.split('/').filter(Boolean))
  .refine(
    (segments) => segments.length > 0 && segments.every(isCanonicalSlug),
    {
      message:
        'path segments must be lowercase, alphanumeric, hyphen-separated',
    },
  );
