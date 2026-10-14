import { describe, expect, it } from 'vitest';
import {
  invitationRecordSchema,
  invitationResendRecordSchema,
  paginatedUsersSchema,
  userRecordSchema,
} from './user-record';

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
  const row = { ...user, twoFactorEnabled: false };

  it('wraps the records with the total', () => {
    expect(paginatedUsersSchema.parse({ items: [row], total: 1 }).total).toBe(
      1,
    );
  });

  it('says whether each person has the second step of sign-in on', () => {
    const parsed = paginatedUsersSchema.parse({
      items: [row, { ...row, id: 'u2', twoFactorEnabled: true }],
      total: 2,
    });

    expect(parsed.items.map((item) => item.twoFactorEnabled)).toEqual([
      false,
      true,
    ]);
  });

  it('refuses a row that does not say it: an administrator would be offered no reset', () => {
    expect(
      paginatedUsersSchema.safeParse({ items: [user], total: 1 }).success,
    ).toBe(false);
  });
});

describe('invitationRecordSchema', () => {
  const waiting = { ...user, isActive: false, invitePending: true };

  it('carries the person and whether the email went out', () => {
    expect(
      invitationRecordSchema.parse({
        user: waiting,
        emailSent: false,
        inviteLink: null,
      }),
    ).toEqual({ user: waiting, emailSent: false, inviteLink: null });
  });

  it('carries the link when there was no mail server to send it', () => {
    const link = 'https://editor.example.com/accept-invite?inviteToken=abc';

    expect(
      invitationRecordSchema.parse({
        user: waiting,
        emailSent: true,
        inviteLink: link,
      }).inviteLink,
    ).toBe(link);
  });

  it('refuses an answer that does not say whether the email went out, or whether there is a link', () => {
    expect(
      invitationRecordSchema.safeParse({ user: waiting, inviteLink: null })
        .success,
    ).toBe(false);
    expect(
      invitationRecordSchema.safeParse({ user: waiting, emailSent: true })
        .success,
    ).toBe(false);
    expect(invitationResendRecordSchema.safeParse({}).success).toBe(false);
  });

  it('carries whether a resent invitation went out, and its new link', () => {
    expect(
      invitationResendRecordSchema.parse({ emailSent: true, inviteLink: null }),
    ).toEqual({ emailSent: true, inviteLink: null });
    expect(
      invitationResendRecordSchema.parse({
        emailSent: true,
        inviteLink: 'https://editor.example.com/accept-invite?inviteToken=xyz',
      }).inviteLink,
    ).toContain('inviteToken=xyz');
  });
});
