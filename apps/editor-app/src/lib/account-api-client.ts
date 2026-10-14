import {
  accountProfileSchema,
  accountSessionListSchema,
  type AccountProfile,
  type AccountSession,
  type ChangeAccountLanguageBody,
  type ChangePasswordRequest,
  type RequestEmailChangeRequest,
  type UpdateAccountProfileRequest,
} from '@kometio/api-contracts';
import type { InterfaceLanguage } from '@kometio/shared-types';
import { request, send } from './http-client';

/** The signed-in person's own profile (docs/adr/0071). */
export async function getAccountProfile(): Promise<AccountProfile> {
  return accountProfileSchema.parse(await request('/account/profile'));
}

/** `slug: null` leaves the address as it is — or has one made from the name, for someone who has none yet. */
export type UpdateAccountProfileInput = UpdateAccountProfileRequest;

export async function updateAccountProfile(
  input: UpdateAccountProfileInput,
): Promise<AccountProfile> {
  return accountProfileSchema.parse(
    await request('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * The language the person chose for the editor — and for the emails they
 * are sent, which are written in it (docs/adr/0100).
 */
export async function changeAccountLanguage(
  language: InterfaceLanguage,
): Promise<AccountProfile> {
  const body: ChangeAccountLanguageBody = { language };
  return accountProfileSchema.parse(
    await request('/account/language', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

export async function uploadAccountAvatar(file: File): Promise<AccountProfile> {
  const body = new FormData();
  body.append('file', file);
  return accountProfileSchema.parse(
    await request('/account/avatar', { method: 'POST', body }),
  );
}

export async function removeAccountAvatar(): Promise<AccountProfile> {
  return accountProfileSchema.parse(
    await request('/account/avatar', { method: 'DELETE' }),
  );
}

export type ChangePasswordInput = ChangePasswordRequest;

/** Ends every other place the person is signed in; this one stays. */
export function changePassword(input: ChangePasswordInput): Promise<void> {
  return send('/account/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type RequestEmailChangeInput = RequestEmailChangeRequest;

/** Mails a link to the NEW address: nothing changes until it is opened. */
export function requestEmailChange(
  input: RequestEmailChangeInput,
): Promise<void> {
  return send('/account/email-change', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Where the person is signed in, the most recently used first (docs/adr/0129). */
export async function getAccountSessions(): Promise<AccountSession[]> {
  return accountSessionListSchema.parse(await request('/account/sessions'))
    .items;
}

/** Signs out of one other device. The one asking cannot be ended from here. */
export function endAccountSession(id: string): Promise<void> {
  return send(`/account/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Signs out of every device but this one. */
export function endOtherAccountSessions(): Promise<void> {
  return send('/account/sessions', { method: 'DELETE' });
}
