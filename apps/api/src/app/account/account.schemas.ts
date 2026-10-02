import { z } from 'zod';
import { interfaceLanguageSchema } from '@kometio/shared-types';
import { pageSlugSchema } from '../pages/page-slug.schemas';
import { newPasswordSchema } from '../auth/auth.schemas';

/**
 * A locale tag as a site may store one: `it`, `pt-BR`, and the spellings
 * the site settings accept too (`EN`, `it_IT`) — a bio keyed by the site's
 * own locale must never be refused for how that locale is written.
 */
const LOCALE_KEY = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/;

/** A few lines about a person, not an essay: what an author box has room for. */
export const BIO_MAX_CHARS = 1000;

export const updateAccountProfileBodySchema = z.object({
  displayName: z.string().max(120),
  // The same rule as a page's slug: it is one segment of an address.
  slug: pageSlugSchema.nullable(),
  bio: z
    .record(
      z.string().regex(LOCALE_KEY, { message: 'bio keys must be locales' }),
      z.string().max(BIO_MAX_CHARS),
    )
    // More languages than any site publishes is not a bio, it is a payload.
    .refine((bio) => Object.keys(bio).length <= 50, {
      message: 'too many languages',
    }),
});
export type UpdateAccountProfileBody = z.infer<
  typeof updateAccountProfileBodySchema
>;

export const changePasswordBodySchema = z.object({
  // Anything but empty: a password chosen before a rule existed must still
  // be able to prove who is asking.
  currentPassword: z.string().min(1),
  newPassword: newPasswordSchema,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const requestEmailChangeBodySchema = z.object({
  // Trimmed like an invited address: pasted with a space, it is still the
  // address, and one with the space kept would never match a sign-in.
  newEmail: z.string().trim().email(),
  currentPassword: z.string().min(1),
});
export type RequestEmailChangeBody = z.infer<
  typeof requestEmailChangeBodySchema
>;

export const changeAccountLanguageBodySchema = z.object({
  language: interfaceLanguageSchema,
});
export type ChangeAccountLanguageBody = z.infer<
  typeof changeAccountLanguageBodySchema
>;
