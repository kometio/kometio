import { z } from 'zod';
import { userRoleSchema } from '@kometio/shared-types';
import { request, send } from './http-client';

export function login(
  email: string,
  password: string,
  captchaToken: string,
): Promise<void> {
  return send('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, captchaToken }),
  });
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
  return send('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, captchaToken }),
  });
}

export function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  return send('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export function verifyEmail(token: string): Promise<void> {
  return send('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/** The link mailed to the new address of an email change; no session is needed to follow it. */
export function confirmEmailChange(token: string): Promise<void> {
  return send('/auth/confirm-email-change', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function acceptInvite(token: string, password: string): Promise<void> {
  return send('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
