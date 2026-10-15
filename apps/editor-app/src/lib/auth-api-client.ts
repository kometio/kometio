import { z } from 'zod';
import {
  loginAnswerSchema,
  type AcceptInviteBody,
  type ConfirmEmailChangeBody,
  type LoginAnswer,
  type LoginRequest,
  type RequestPasswordResetRequest,
  type ResetPasswordBody,
  type SecondFactorLoginBody,
  type VerifyEmailBody,
} from '@kometio/api-contracts';
import { userRoleSchema } from '@kometio/shared-types';
import { request, send } from './http-client';

/**
 * Signs in with the password. A person who has the second step on is not
 * signed in by it: the answer is a challenge, which `loginSecondFactor` sends
 * back with a code (docs/adr/0137).
 */
export async function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<LoginAnswer> {
  const body: LoginRequest = { email, password, captchaToken };
  return loginAnswerSchema.parse(
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

/** What the second step answers with when it signs the person in. */
const secondFactorSignedInSchema = z.object({
  userId: z.string(),
  /** How many recovery codes are left, when one was just used; `null` otherwise. */
  recoveryCodesLeft: z.number().int().min(0).nullable(),
});
export type SecondFactorSignedIn = z.infer<typeof secondFactorSignedInSchema>;

export async function loginSecondFactor(
  challenge: string,
  code: string,
): Promise<SecondFactorSignedIn> {
  const body: SecondFactorLoginBody = { challenge, code };
  return secondFactorSignedInSchema.parse(
    await request('/auth/login/second-factor', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

/** Who is logged in, and what they are allowed to be shown. */
const currentSessionSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: userRoleSchema,
});

export type CurrentSession = z.infer<typeof currentSessionSchema>;

export async function currentSession(): Promise<CurrentSession> {
  return currentSessionSchema.parse(await request('/auth/session'));
}

export function logout(): Promise<void> {
  return send('/auth/logout', { method: 'POST' });
}

export function requestPasswordReset(
  email: string,
  captchaToken: string,
): Promise<void> {
  const body: RequestPasswordResetRequest = { email, captchaToken };
  return send('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const body: ResetPasswordBody = { token, newPassword };
  return send('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function verifyEmail(token: string): Promise<void> {
  const body: VerifyEmailBody = { token };
  return send('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** The link mailed to the new address of an email change; no session is needed to follow it. */
export function confirmEmailChange(token: string): Promise<void> {
  const body: ConfirmEmailChangeBody = { token };
  return send('/auth/confirm-email-change', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function acceptInvite(token: string, password: string): Promise<void> {
  const body: AcceptInviteBody = { token, password };
  return send('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
