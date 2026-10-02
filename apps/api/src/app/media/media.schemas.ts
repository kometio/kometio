import { z } from 'zod';
import { MEDIA_KINDS } from '@kometio/shared-types';

export const listMediaQuerySchema = z.object({
  siteId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /**
   * Part of a filename. The library is paginated, so this has to be
   * answered here and not by the caller filtering what came back — that
   * would be a search that only ever looked at the newest page.
   */
  search: z.string().trim().max(200).optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
});
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;

export const countMediaByKindQuerySchema = z.object({
  siteId: z.string().uuid(),
});
export type CountMediaByKindQuery = z.infer<typeof countMediaByKindQuerySchema>;

export const uploadMediaBodySchema = z.object({
  siteId: z.string().uuid(),
});
export type UploadMediaBody = z.infer<typeof uploadMediaBodySchema>;

/**
 * What may be changed about a file: its name and its alternative text.
 * Whether a name is acceptable is `Media.rename`'s rule, not this schema's,
 * so the same answer comes whichever way it is reached; this only bounds
 * the size of what is read and asks for something to change.
 */
export const updateMediaBodySchema = z
  .object({
    filename: z.string().max(1000).optional(),
    alt: z.string().max(1000).optional(),
  })
  .refine((body) => body.filename !== undefined || body.alt !== undefined, {
    message: 'Nothing to change: send a filename, an alt, or both',
  });
export type UpdateMediaBody = z.infer<typeof updateMediaBodySchema>;
