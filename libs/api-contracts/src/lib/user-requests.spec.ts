import { describe, expect, it } from 'vitest';
import {
  inviteUserBodySchema,
  listUsersQuerySchema,
  setUserActiveBodySchema,
  updateUserRoleBodySchema,
  USERS_MAX_PAGE_SIZE,
} from './user-requests';

describe('listUsersQuerySchema', () => {
  it('reads the numbers of a query string, with a first page of twenty by default', () => {
    expect(listUsersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listUsersQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it('refuses a page size above the ceiling the editor asks for everybody with', () => {
    expect(
      listUsersQuerySchema.safeParse({ pageSize: String(USERS_MAX_PAGE_SIZE) })
        .success,
    ).toBe(true);
    expect(
      listUsersQuerySchema.safeParse({
        pageSize: String(USERS_MAX_PAGE_SIZE + 1),
      }).success,
    ).toBe(false);
    expect(listUsersQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('inviteUserBodySchema', () => {
  const invitation = {
    email: 'ada@example.test',
    displayName: 'Ada',
    role: 'editor',
  };

  it('takes an invitation, with the language left to the site', () => {
    expect(inviteUserBodySchema.safeParse(invitation).success).toBe(true);
    expect(
      inviteUserBodySchema.safeParse({ ...invitation, language: 'en' }).success,
    ).toBe(true);
  });

  it.each([
    ['an email that is not one', { ...invitation, email: 'ada' }],
    ['no name', { ...invitation, displayName: '' }],
    [
      'a name longer than a profile’s',
      { ...invitation, displayName: 'x'.repeat(121) },
    ],
    ['a role there is not', { ...invitation, role: 'owner' }],
    ['a language the editor does not have', { ...invitation, language: 'fr' }],
  ])('refuses %s', (_name, body) => {
    expect(inviteUserBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('the bodies that change a user', () => {
  it('takes a role, and refuses one that is not', () => {
    expect(updateUserRoleBodySchema.safeParse({ role: 'admin' }).success).toBe(
      true,
    );
    expect(updateUserRoleBodySchema.safeParse({ role: 'root' }).success).toBe(
      false,
    );
  });

  it('takes a boolean for whether a user is active, and nothing else', () => {
    expect(setUserActiveBodySchema.safeParse({ isActive: false }).success).toBe(
      true,
    );
    expect(setUserActiveBodySchema.safeParse({ isActive: 'no' }).success).toBe(
      false,
    );
  });
});
