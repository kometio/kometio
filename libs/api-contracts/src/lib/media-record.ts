import { z } from 'zod';
import { MEDIA_KINDS, STORAGE_PROVIDERS } from '@kometio/shared-types';

/** One file in the library, as every `/media` response carries it (docs/adr/0026). */
export const mediaRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  filename: z.string(),
  /** The alternative text held for the file; empty until somebody writes one. */
  alt: z.string(),
  storageKey: z.string(),
  storageProvider: z.enum(STORAGE_PROVIDERS),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  createdAt: z.string(),
  /** Resolved by the storage adapter, so a file moved to S3 is not a different record. */
  url: z.string(),
});

export type MediaRecord = z.infer<typeof mediaRecordSchema>;

export const paginatedMediaSchema = z.object({
  items: z.array(mediaRecordSchema),
  total: z.number(),
});

export type PaginatedMedia = z.infer<typeof paginatedMediaSchema>;

/** `GET /media/kinds` — how many files each of the library's folders holds, one entry per kind even when it is zero. */
export const mediaKindCountsSchema = z.record(z.enum(MEDIA_KINDS), z.number());

export type MediaKindCounts = z.infer<typeof mediaKindCountsSchema>;

/**
 * Where a file is in use — what would be left with a hole if it were
 * deleted. Looked for in what pages, shared sections and the header and
 * footer hold now (their drafts and what is live), not in their history.
 */
export const mediaUsageSchema = z.object({
  pages: z.array(
    z.object({
      pageGroupId: z.string(),
      /** How the page is called: its title in the site's default language, or the address it has there. */
      title: z.string(),
      /** The languages of the page that hold the file. */
      locales: z.array(z.string()),
    }),
  ),
  sections: z.array(
    z.object({
      sectionId: z.string(),
      name: z.string(),
      kind: z.enum(['shared', 'template']),
    }),
  ),
  layout: z.array(
    z.object({
      kind: z.enum(['header', 'footer']),
      locale: z.string(),
    }),
  ),
});

export type MediaUsage = z.infer<typeof mediaUsageSchema>;
