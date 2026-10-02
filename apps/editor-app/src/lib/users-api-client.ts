import { type InterfaceLanguage, type UserRole } from '@kometio/shared-types';
import {
  type PaginatedUsers,
  type UserRecord,
  paginatedUsersSchema,
  userRecordSchema,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

export type { PaginatedUsers, UserRecord, UserRole };

export async function listUsers(
  page: number,
  pageSize: number,
): Promise<PaginatedUsers> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return paginatedUsersSchema.parse(
    await request(`/users?${params.toString()}`),
  );
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  role: UserRole;
  /** What the invitation — and every email after it — is written in. */
  language: InterfaceLanguage;
}

export async function inviteUser(input: InviteUserInput): Promise<UserRecord> {
  return userRecordSchema.parse(
    await request('/users/invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function updateUserRole(
  id: string,
  role: UserRole,
): Promise<UserRecord> {
  return userRecordSchema.parse(
    await request(`/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  );
}

export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<UserRecord> {
  return userRecordSchema.parse(
    await request(`/users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  );
}

/** Sends the invitation again, with a fresh link — the old one may have expired. */
export function resendInvite(id: string): Promise<void> {
  return send(`/users/${id}/resend-invite`, { method: 'POST' });
}

/** Withdraws an invitation that has not been accepted: the link stops working and the person is removed. */
export function cancelInvite(id: string): Promise<void> {
  return send(`/users/${id}/invite`, { method: 'DELETE' });
}
