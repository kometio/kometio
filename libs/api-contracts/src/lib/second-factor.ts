import { z } from 'zod';

/**
 * What the second step of a sign-in says over the wire (docs/adr/0137).
 *
 * The sign-in's own answer is in auth-requests.ts; these are the account's
 * side of it: turning it on, the codes, and turning it off.
 */

/** Whether this server can ask for it, whether this person has it on, and how many recovery codes are left to them. */
export const secondFactorStatusSchema = z.object({
  /** `false` where the deployment has nowhere to keep a sealed secret: the editor offers nothing. */
  available: z.boolean(),
  enabled: z.boolean(),
  /** `0` when it is off. */
  recoveryCodesLeft: z.number().int().min(0),
});
export type SecondFactorStatus = z.infer<typeof secondFactorStatusSchema>;

/**
 * The password again, for everything that begins, replaces or removes a way
 * in: a session left open must not be enough.
 */
export const passwordConfirmationBodySchema = z.object({
  password: z.string().min(1),
});
export type PasswordConfirmationBody = z.infer<
  typeof passwordConfirmationBodySchema
>;

/** What the person is shown to put into their app: once, and never again. */
export const secondFactorEnrolmentSchema = z.object({
  /** The secret as text, for an app that cannot scan. */
  secret: z.string().min(1),
  /** The `otpauth://` address the QR code says. */
  provisioningUri: z.string().min(1),
});
export type SecondFactorEnrolment = z.infer<typeof secondFactorEnrolmentSchema>;

/** The six digits the app shows (spaces allowed: it prints them in two groups). */
export const confirmSecondFactorBodySchema = z.object({
  code: z.string().trim().min(1).max(32),
});
export type ConfirmSecondFactorBody = z.infer<
  typeof confirmSecondFactorBodySchema
>;

/** The codes that stand in for the app, in the clear, once. */
export const recoveryCodesSchema = z.object({
  recoveryCodes: z.array(z.string().min(1)).min(1),
});
export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;
