import { z } from 'zod';
import { interfaceLanguageSchema, userRoleSchema } from '@kometio/shared-types';

/**
 * A person with access to the editor, as the users screen sees them
 * (docs/adr/0026). The avatar arrives as a URL the storage adapter
 * resolved, never the storage key it sits under.
 */
export const userRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  /** The person's author address, or `null` until they have a name (docs/adr/0071). */
  slug: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: userRoleSchema,
  isActive: z.boolean(),
  /**
   * True until the invitation is accepted. Not the same as `!isActive`,
   * which a deactivated person also is: this is what the users' list uses
   * to offer "resend" and "cancel" to the one and "reactivate" to the other.
   */
  invitePending: z.boolean(),
  /**
   * The language the person chose for the editor and for the emails they
   * are sent (docs/adr/0100), or `null` until they choose — then the site's
   * language decides.
   */
  language: interfaceLanguageSchema.nullable(),
  emailVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type UserRecord = z.infer<typeof userRecordSchema>;

export const paginatedUsersSchema = z.object({
  items: z.array(userRecordSchema),
  total: z.number(),
});

export type PaginatedUsers = z.infer<typeof paginatedUsersSchema>;
