import { describe, expect, it } from 'vitest';
import { paginatedUsersSchema, userRecordSchema } from './user-record';

const user = {
  id: 'u1',
  tenantId: 'tenant-1',
  email: 'ada@esempio.test',
  displayName: null,
  slug: null,
  avatarUrl: null,
  role: 'editor',
  isActive: true,
  invitePending: false,
  language: null,
  emailVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('userRecordSchema', () => {
  it('accepts a member of the team and never carries a password hash', () => {
    const parsed = userRecordSchema.parse({ ...user, passwordHash: 'x' });

    expect(parsed).toEqual(user);
  });

  it('tells somebody waiting to join from somebody switched off', () => {
    const waiting = { ...user, isActive: false, invitePending: true };
    const switchedOff = { ...user, isActive: false, invitePending: false };

    expect(userRecordSchema.parse(waiting).invitePending).toBe(true);
    expect(userRecordSchema.parse(switchedOff).invitePending).toBe(false);
  });

  it('refuses a record that does not say whether the invitation is pending', () => {
    const { invitePending, ...withoutIt } = user;
    void invitePending;

    expect(userRecordSchema.safeParse(withoutIt).success).toBe(false);
  });

  it.each(['it', 'en'] as const)(
    'carries the language a person chose: %s',
    (language) => {
      expect(userRecordSchema.parse({ ...user, language }).language).toBe(
        language,
      );
    },
  );

  it('refuses a language the emails are not written in, and a record without the field', () => {
    expect(
      userRecordSchema.safeParse({ ...user, language: 'fr' }).success,
    ).toBe(false);
    const { language, ...withoutIt } = user;
    void language;
    expect(userRecordSchema.safeParse(withoutIt).success).toBe(false);
  });

  it('refuses a role the editor has no permissions for', () => {
    expect(userRecordSchema.safeParse({ ...user, role: 'owner' }).success).toBe(
      false,
    );
  });
});

describe('paginatedUsersSchema', () => {
  it('wraps the records with the total', () => {
    expect(paginatedUsersSchema.parse({ items: [user], total: 1 }).total).toBe(
      1,
    );
  });
});
