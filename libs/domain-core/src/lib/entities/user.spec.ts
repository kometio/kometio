import { describe, expect, it } from 'vitest';
import { InvitePendingError } from '../errors';
import { User } from './user';

describe('User entity', () => {
  const baseInput = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: 'hash-1',
    role: 'admin' as const,
  };

  it('create() exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const user = User.create({ ...baseInput, now });

    expect(user.id).toBe('user-1');
    expect(user.tenantId).toBe('tenant-1');
    expect(user.email).toBe('lele@example.com');
    expect(user.displayName).toBe('Lele');
    expect(user.passwordHash).toBe('hash-1');
    expect(user.role).toBe('admin');
    expect(user.isActive).toBe(true);
    expect(user.createdAt).toEqual(now);
  });

  it('create() defaults isActive to true, and to false when explicitly requested (invite flow)', () => {
    expect(User.create(baseInput).isActive).toBe(true);
    expect(User.create({ ...baseInput, isActive: false }).isActive).toBe(false);
  });

  it('changeRole/changeDisplayName replace the stored value', () => {
    const user = User.create(baseInput);

    user.changeRole('publisher');
    user.changeDisplayName('Raffaele');

    expect(user.role).toBe('publisher');
    expect(user.displayName).toBe('Raffaele');
  });

  it('deactivate/reactivate toggle isActive', () => {
    const user = User.create(baseInput);

    user.deactivate();
    expect(user.isActive).toBe(false);

    user.reactivate();
    expect(user.isActive).toBe(true);
  });

  describe('an invitation', () => {
    const invited = () =>
      User.create({ ...baseInput, isActive: false, invitePending: true });

    it('is not pending for anyone who was not invited', () => {
      expect(User.create(baseInput).invitePending).toBe(false);
    });

    it('is pending from the invitation, and the person cannot sign in yet', () => {
      const user = invited();

      expect(user.invitePending).toBe(true);
      expect(user.isActive).toBe(false);
    });

    it('ends when it is accepted, and the person can sign in', () => {
      const user = invited();

      user.acceptInvite();

      expect(user.invitePending).toBe(false);
      expect(user.isActive).toBe(true);
    });

    it('cannot be switched on from outside while it is pending', () => {
      expect(() => invited().reactivate()).toThrow(InvitePendingError);
    });

    it('does not stop a deactivated person, who is not pending, being reactivated', () => {
      const user = User.create(baseInput);
      user.deactivate();

      user.reactivate();

      expect(user.isActive).toBe(true);
    });
  });

  it('starts unverified', () => {
    const user = User.create(baseInput);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.isEmailVerified).toBe(false);
  });

  it('verifyEmail marks the email as verified', () => {
    const user = User.create(baseInput);
    const now = new Date('2026-01-01T00:00:00Z');

    user.verifyEmail(now);

    expect(user.emailVerifiedAt).toEqual(now);
    expect(user.isEmailVerified).toBe(true);
  });

  it('changePasswordHash replaces the stored hash', () => {
    const user = User.create(baseInput);

    user.changePasswordHash('hash-2');

    expect(user.passwordHash).toBe('hash-2');
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...baseInput,
      isActive: true,
      invitePending: false,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2025-12-01T00:00:00Z'),
      slug: 'giulia-rossi',
      formerSlugs: ['giulia'],
      bio: { it: 'Scrive di caffè', en: 'Writes about coffee' },
      avatar: { storageKey: 'a.webp', width: 256, height: 256 },
      language: 'en' as const,
    };

    const user = User.fromProps(props);

    expect(user.toProps()).toEqual(props);
  });

  describe('the author profile', () => {
    it('starts with no address, no bio and no picture', () => {
      const user = User.create(baseInput);
      expect([user.slug, user.formerSlugs, user.bio, user.avatar]).toEqual([
        null,
        [],
        {},
        null,
      ]);
    });

    it('takes the address it was created with', () => {
      expect(User.create({ ...baseInput, slug: 'mario' }).slug).toBe('mario');
    });

    it('remembers every address it left, so each can redirect', () => {
      const user = User.create({ ...baseInput, slug: 'mario' });
      user.changeSlug('mario-rossi');
      user.changeSlug('m-rossi');

      expect(user.slug).toBe('m-rossi');
      expect(user.formerSlugs).toEqual(['mario', 'mario-rossi']);
    });

    it('does not keep an address as both current and former when going back to it', () => {
      const user = User.create({ ...baseInput, slug: 'mario' });
      user.changeSlug('mario-rossi');
      user.changeSlug('mario');

      expect(user.slug).toBe('mario');
      expect(user.formerSlugs).toEqual(['mario-rossi']);
    });

    it('leaves nothing behind when given its first address', () => {
      const user = User.create(baseInput);
      user.changeSlug('mario');
      expect(user.formerSlugs).toEqual([]);
    });

    it('keeps a bio only in the languages something was written in', () => {
      const user = User.create(baseInput);
      user.changeBio({ it: '  Cuoco  ', en: '   ', fr: '' });
      expect(user.bio).toEqual({ it: 'Cuoco' });
    });

    it('hands back the picture it replaces, for storage to delete', () => {
      const user = User.create(baseInput);
      const first = { storageKey: 'one.webp', width: 10, height: 10 };
      expect(user.changeAvatar(first)).toBeNull();
      expect(user.changeAvatar(null)).toEqual(first);
      expect(user.avatar).toBeNull();
    });
  });

  describe('changing the email', () => {
    it('moves to the new address and counts it as verified from that moment', () => {
      const user = User.create(baseInput);
      expect(user.isEmailVerified).toBe(false);
      const now = new Date('2026-09-30T12:00:00.000Z');

      user.changeEmail('new@example.com', now);

      expect(user.email).toBe('new@example.com');
      expect(user.emailVerifiedAt).toEqual(now);
    });
  });

  describe('the language', () => {
    it("is none until one is chosen — the site's default stands in", () => {
      expect(User.create(baseInput).language).toBeNull();
    });

    it('is the one an invitation was written in, and changes when the person chooses', () => {
      const user = User.create({ ...baseInput, language: 'en' });
      expect(user.language).toBe('en');

      user.changeLanguage('it');

      expect(user.language).toBe('it');
    });
  });
});
