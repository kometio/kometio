import { z } from 'zod';
import { interfaceLanguageSchema, userRoleSchema } from '@kometio/shared-types';

/** The most users one page of the list may ask for: what a client that wants everybody asks. */
export const USERS_MAX_PAGE_SIZE = 100;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(USERS_MAX_PAGE_SIZE).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const inviteUserBodySchema = z.object({
  email: z.string().email(),
  // The same ceiling the person's own profile has (account-requests.ts).
  displayName: z.string().min(1).max(120),
  role: userRoleSchema,
  // What the invitation and everything after it is written in, chosen by
  // whoever invites (docs/adr/0100). Left out, the site's language decides.
  language: interfaceLanguageSchema.optional(),
});
export type InviteUserBody = z.infer<typeof inviteUserBodySchema>;

export const updateUserRoleBodySchema = z.object({
  role: userRoleSchema,
});
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleBodySchema>;

export const setUserActiveBodySchema = z.object({
  isActive: z.boolean(),
});
export type SetUserActiveBody = z.infer<typeof setUserActiveBodySchema>;

export type InviteUserRequest = z.input<typeof inviteUserBodySchema>;
