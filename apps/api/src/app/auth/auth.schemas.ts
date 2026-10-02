import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';

/** A password somebody chooses: the reset, the invitation and the change all ask the same of it. */
export const newPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`,
  );

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Default to '', not required: an empty token is a real user input (the
  // client-side Turnstile widget failing to load/render), not a malformed
  // request — same convention as public-forms, and it lets the use-case's
  // own InvalidCaptchaError produce the right domain-mapped error instead
  // of a raw zod validation 400.
  captchaToken: z.string().default(''),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;

export const confirmEmailChangeBodySchema = z.object({
  token: z.string().min(1),
});
export type ConfirmEmailChangeBody = z.infer<
  typeof confirmEmailChangeBodySchema
>;

export const requestPasswordResetBodySchema = z.object({
  email: z.string().email(),
  captchaToken: z.string().default(''),
});
export type RequestPasswordResetBody = z.infer<
  typeof requestPasswordResetBodySchema
>;

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: newPasswordSchema,
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

export const acceptInviteBodySchema = z.object({
  token: z.string().min(1),
  password: newPasswordSchema,
});
export type AcceptInviteBody = z.infer<typeof acceptInviteBodySchema>;
