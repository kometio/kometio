import { z } from 'zod';
import type {
  AcceptInviteBody,
  ConfirmEmailChangeBody,
  LoginRequest,
  RequestPasswordResetRequest,
  ResetPasswordBody,
  VerifyEmailBody,
} from '@kometio/api-contracts';
import { userRoleSchema } from '@kometio/shared-types';
import { request, send } from './http-client';

export function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<void> {
  const body: LoginRequest = { email, password, captchaToken };
  return send('/auth/login', { method: 'POST', body: JSON.stringify(body) });
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
