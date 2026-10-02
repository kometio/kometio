import { z } from 'zod';
import { interfaceLanguageSchema, userRoleSchema } from '@kometio/shared-types';

/** The signed-in person's own profile, as the editor reads and writes it. */
export const accountProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: userRoleSchema,
  displayName: z.string().nullable(),
  /** `null` until they have a name: an address made from an email would publish part of it. */
  slug: z.string().nullable(),
  /** One entry per language they wrote it in, keyed by locale. */
  bio: z.record(z.string(), z.string()),
  avatarUrl: z.string().nullable(),
  /** The language the editor and every email speak to them in; `null` until they choose, and the site's default stands in. */
  language: interfaceLanguageSchema.nullable(),
});

export type AccountProfile = z.infer<typeof accountProfileSchema>;
