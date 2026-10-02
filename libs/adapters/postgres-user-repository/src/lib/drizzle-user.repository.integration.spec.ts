import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LastActiveAdminError,
  User,
  UserEmailAlreadyExistsError,
  UserSlugAlreadyExistsError,
} from '@kometio/domain-core';
import {
  type KometioDb,
  createAppDb,
  users,
  verificationTokens,
  withTenant,
} from '@kometio/postgres-db';
import { eq } from 'drizzle-orm';
import {
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleUserRepository } from './drizzle-user.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this is also the RLS regression
 * test for `users`.
 */
describe('DrizzleUserRepository (integration)', () => {
  let db: KometioDb;
  let userRepository: DrizzleUserRepository;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    db = createAppDb();
    userRepository = new DrizzleUserRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function buildUser(
    overrides: Partial<Parameters<typeof User.create>[0]> = {},
  ) {
    return User.create({
      id: randomUUID(),
      tenantId: tenantAId,
      email: `user-${randomUUID()}@example.com`,
      displayName: 'Test User',
      passwordHash: 'irrelevant-for-this-suite',
      role: 'admin',
      ...overrides,
    });
  }

  it('saves and retrieves a user by id, scoped to its tenant', async () => {
    const user = buildUser();
    await userRepository.add(user);

    const found = await userRepository.findById(tenantAId, user.id);
    expect(found?.email).toBe(user.email);

    const foundFromOtherTenant = await userRepository.findById(
      tenantBId,
      user.id,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('findByEmail scopes by tenant', async () => {
    const user = buildUser();
    await userRepository.add(user);

    const found = await userRepository.findByEmail(tenantAId, user.email);
    expect(found?.id).toBe(user.id);

    const foundFromOtherTenant = await userRepository.findByEmail(
      tenantBId,
      user.email,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('returns null for an email that does not exist', async () => {
    expect(
      await userRepository.findByEmail(tenantAId, 'nobody@example.com'),
    ).toBeNull();
  });

  // Regression: inviteUser's check-then-act isn't atomic — under real
  // concurrency (two near-simultaneous invites to the same email) the
  // second insert must still fail with the domain error, not a raw
  // PostgresError. Simulated here by skipping the use-case's own check
  // entirely and saving two users with the same email directly.
  it('save() rejects a second user with the same tenant/email with UserEmailAlreadyExistsError', async () => {
    const email = `duplicate-${randomUUID()}@example.com`;
    const first = buildUser({ email });
    await userRepository.add(first);

    const second = buildUser({ email });
    await expect(userRepository.add(second)).rejects.toThrow(
      UserEmailAlreadyExistsError,
    );
  });

  describe('an email is the same address whatever the case it was typed in', () => {
    it('findByEmail finds the person by the address in any case, and returns it as stored', async () => {
      const user = buildUser({
        email: `Mario.Rossi-${randomUUID()}@Example.com`,
      });
      await userRepository.add(user);

      for (const typed of [
        user.email,
        user.email.toLowerCase(),
        user.email.toUpperCase(),
      ]) {
        const found = await userRepository.findByEmail(tenantAId, typed);
        expect(found?.id).toBe(user.id);
        expect(found?.email).toBe(user.email);
      }
    });

    it('refuses a second account whose address differs only by case, with UserEmailAlreadyExistsError', async () => {
      const token = randomUUID();
      await userRepository.add(
        buildUser({ email: `Ana-${token}@example.com` }),
      );

      await expect(
        userRepository.add(buildUser({ email: `ana-${token}@EXAMPLE.com` })),
      ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
    });

    it('saveCredentials refuses an address that only differs by case from somebody else’s', async () => {
      const token = randomUUID();
      const taken = buildUser({ email: `Taken-${token}@example.com` });
      const other = buildUser();
      await userRepository.add(taken);
      await userRepository.add(other);

      await expect(
        userRepository.saveCredentials(
          User.fromProps({
            ...other.toProps(),
            email: `taken-${token}@example.com`,
          }),
        ),
      ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
    });

    it('lets the same person change only the case of their own address', async () => {
      const token = randomUUID();
      const user = buildUser({ email: `lele-${token}@example.com` });
      await userRepository.add(user);

      await userRepository.saveCredentials(
        User.fromProps({
          ...user.toProps(),
          email: `Lele-${token}@example.com`,
        }),
      );

      expect((await userRepository.findById(tenantAId, user.id))?.email).toBe(
        `Lele-${token}@example.com`,
      );
    });

    it('still keeps two tenants apart: the same address may exist in both', async () => {
      const email = `shared-${randomUUID()}@example.com`;
      await userRepository.add(buildUser({ email }));

      await userRepository.add(
        buildUser({ email: email.toUpperCase(), tenantId: tenantBId }),
      );

      expect(
        (await userRepository.findByEmail(tenantBId, email))?.tenantId,
      ).toBe(tenantBId);
    });
  });

  describe('the author profile', () => {
    it('stores and reads back the address, the former ones, the bio and the picture', async () => {
      const user = buildUser({ slug: `giulia-${randomUUID()}` });
      user.changeSlug(`giulia-rossi-${randomUUID()}`);
      user.changeBio({ it: 'Scrive di caffè', en: 'Writes about coffee' });
      user.changeAvatar({ storageKey: 'face.webp', width: 256, height: 240 });
      await userRepository.add(user);

      const found = await userRepository.findById(tenantAId, user.id);
      expect(found?.toProps()).toEqual(user.toProps());
    });

    it('finds a person by their address, and by an address they left', async () => {
      const first = `mario-${randomUUID()}`;
      const second = `mario-rossi-${randomUUID()}`;
      const user = buildUser({ slug: first });
      user.changeSlug(second);
      await userRepository.add(user);

      expect((await userRepository.findBySlug(tenantAId, second))?.id).toBe(
        user.id,
      );
      expect(await userRepository.findBySlug(tenantAId, first)).toBeNull();
      expect(
        (await userRepository.findByFormerSlug(tenantAId, first))?.id,
      ).toBe(user.id);
      expect(await userRepository.findBySlug(tenantBId, second)).toBeNull();
    });

    it('counts an address as taken whether it is current or former, except for its owner', async () => {
      const former = `anna-${randomUUID()}`;
      const current = `anna-b-${randomUUID()}`;
      const user = buildUser({ slug: former });
      user.changeSlug(current);
      await userRepository.add(user);

      expect(await userRepository.isSlugTaken(tenantAId, current, null)).toBe(
        true,
      );
      expect(await userRepository.isSlugTaken(tenantAId, former, null)).toBe(
        true,
      );
      expect(
        await userRepository.isSlugTaken(tenantAId, current, user.id),
      ).toBe(false);
      expect(await userRepository.isSlugTaken(tenantBId, current, null)).toBe(
        false,
      );
    });

    it('refuses two people at the same address in one tenant, and lets any number have none', async () => {
      const slug = `same-${randomUUID()}`;
      await userRepository.add(buildUser({ slug }));
      await expect(userRepository.add(buildUser({ slug }))).rejects.toThrow(
        UserSlugAlreadyExistsError,
      );

      await userRepository.add(buildUser({ slug: null }));
      await userRepository.add(buildUser({ slug: null }));
    });

    /*
     * A profile saved from a copy read before an admin switched the person
     * off must not switch them back on: the profile writes its own columns
     * and no others.
     */
    it('saves a profile or a picture without touching role, status or each other', async () => {
      const user = buildUser({ slug: `luca-${randomUUID()}` });
      await userRepository.add(user);
      const readByThePerson = await userRepository.findById(tenantAId, user.id);
      const readByTheUpload = await userRepository.findById(tenantAId, user.id);
      if (!readByThePerson || !readByTheUpload) throw new Error('not saved');

      const readByTheAdmin = await userRepository.findById(tenantAId, user.id);
      readByTheAdmin?.deactivate();
      readByTheAdmin?.changeRole('editor');
      if (readByTheAdmin) await userRepository.saveAccess(readByTheAdmin);

      readByTheUpload.changeAvatar({
        storageKey: 'new.webp',
        width: 10,
        height: 10,
      });
      await userRepository.saveAvatar(readByTheUpload);
      readByThePerson.changeDisplayName('Luca Verdi');
      readByThePerson.changeBio({ it: 'Fotografo' });
      await userRepository.saveProfile(readByThePerson);

      const stored = await userRepository.findById(tenantAId, user.id);
      expect(stored?.isActive).toBe(false);
      expect(stored?.role).toBe('editor');
      expect(stored?.displayName).toBe('Luca Verdi');
      expect(stored?.bio).toEqual({ it: 'Fotografo' });
      expect(stored?.avatar?.storageKey).toBe('new.webp');
    });

    it('refuses a profile saved onto an address someone else has', async () => {
      const slug = `taken-${randomUUID()}`;
      await userRepository.add(buildUser({ slug }));
      const other = buildUser({ slug: null });
      await userRepository.add(other);

      other.changeSlug(slug);
      await expect(userRepository.saveProfile(other)).rejects.toThrow(
        UserSlugAlreadyExistsError,
      );
    });
  });

  /*
   * Two admins demoting each other at the same moment each counted two
   * admins, each went ahead, and the site was left with nobody able to
   * administer it (audit B11). The count and the write are one locked
   * step now: exactly one of the two goes through.
   */
  describe('a pending invitation', () => {
    const invitee = () =>
      buildUser({ isActive: false, invitePending: true, role: 'editor' });

    it('is stored, and read back as pending', async () => {
      const user = invitee();
      await userRepository.add(user);

      const found = await userRepository.findById(tenantAId, user.id);

      expect(found?.invitePending).toBe(true);
      expect(found?.isActive).toBe(false);
    });

    it('is removed together with its invite links, and the email is free again', async () => {
      const user = invitee();
      await userRepository.add(user);
      await withTenant(db, tenantAId, (tx) =>
        tx.insert(verificationTokens).values({
          tenantId: tenantAId,
          userId: user.id,
          purpose: 'user-invite',
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      expect(await userRepository.removePendingInvite(tenantAId, user.id)).toBe(
        true,
      );

      expect(await userRepository.findById(tenantAId, user.id)).toBeNull();
      // The link went with the person: nothing is left to accept.
      const links = await withTenant(db, tenantAId, (tx) =>
        tx
          .select({ id: verificationTokens.id })
          .from(verificationTokens)
          .where(eq(verificationTokens.userId, user.id)),
      );
      expect(links).toEqual([]);
      await userRepository.add(buildUser({ email: user.email }));
    });

    it('is not removed once accepted — the delete itself checks, not just the caller', async () => {
      const user = invitee();
      await userRepository.add(user);
      user.changePasswordHash('chosen-by-the-invitee');
      user.acceptInvite();
      await userRepository.saveInviteAccepted(user);

      expect(await userRepository.removePendingInvite(tenantAId, user.id)).toBe(
        false,
      );
      expect(await userRepository.findById(tenantAId, user.id)).not.toBeNull();
    });

    it('is not removed for somebody who was only switched off', async () => {
      const user = buildUser({ isActive: false });
      await userRepository.add(user);

      expect(await userRepository.removePendingInvite(tenantAId, user.id)).toBe(
        false,
      );
    });

    it('is not removed from another tenant', async () => {
      const user = invitee();
      await userRepository.add(user);

      expect(await userRepository.removePendingInvite(tenantBId, user.id)).toBe(
        false,
      );
      expect(await userRepository.findById(tenantAId, user.id)).not.toBeNull();
    });

    it('is not touched by saving access — role and status are all that writes', async () => {
      const user = invitee();
      await userRepository.add(user);
      const other = buildUser();
      await userRepository.add(other);

      user.changeRole('publisher');
      await userRepository.saveAccess(user);

      expect(
        (await userRepository.findById(tenantAId, user.id))?.invitePending,
      ).toBe(true);
    });
  });

  describe('saveCredentials', () => {
    it('writes the password, the email and whether it is verified — and nothing an admin decides', async () => {
      const editor = buildUser({ role: 'editor' });
      await userRepository.add(editor);

      // Read before an admin switches the person off …
      const read = await userRepository.findById(tenantAId, editor.id);
      if (!read) throw new Error('the person just added is missing');
      const switchedOff = User.fromProps({
        ...editor.toProps(),
        isActive: false,
      });
      await userRepository.saveAccess(switchedOff);

      // … and written after: only the credentials go, so the switch-off stays.
      const verifiedAt = new Date('2026-09-30T10:00:00.000Z');
      const changed = User.fromProps({
        ...read.toProps(),
        passwordHash: 'a-new-hash',
        email: `changed-${randomUUID()}@example.com`,
        emailVerifiedAt: verifiedAt,
      });
      await userRepository.saveCredentials(changed);

      const stored = await userRepository.findById(tenantAId, editor.id);
      expect(stored?.passwordHash).toBe('a-new-hash');
      expect(stored?.email).toBe(changed.email);
      expect(stored?.emailVerifiedAt).toEqual(verifiedAt);
      expect(stored?.isActive).toBe(false);
    });

    it('refuses an email somebody else already has, whoever asks first', async () => {
      const taken = buildUser();
      const other = buildUser();
      await userRepository.add(taken);
      await userRepository.add(other);

      await expect(
        userRepository.saveCredentials(
          User.fromProps({ ...other.toProps(), email: taken.email }),
        ),
      ).rejects.toBeInstanceOf(UserEmailAlreadyExistsError);
      expect((await userRepository.findById(tenantAId, other.id))?.email).toBe(
        other.email,
      );
    });

    it('does not reach a person of another tenant', async () => {
      const user = buildUser();
      await userRepository.add(user);

      await userRepository.saveCredentials(
        User.fromProps({
          ...user.toProps(),
          tenantId: tenantBId,
          passwordHash: 'not-yours',
        }),
      );

      expect(
        (await userRepository.findById(tenantAId, user.id))?.passwordHash,
      ).toBe('irrelevant-for-this-suite');
    });
  });

  describe('the language', () => {
    it('is stored and read back, and is none for a person who has not chosen', async () => {
      const chosen = buildUser({ language: 'en' });
      const unchosen = buildUser();
      await userRepository.add(chosen);
      await userRepository.add(unchosen);

      expect(
        (await userRepository.findById(tenantAId, chosen.id))?.language,
      ).toBe('en');
      expect(
        (await userRepository.findById(tenantAId, unchosen.id))?.language,
      ).toBeNull();
    });

    it('saveLanguage writes the language and nothing an admin decides', async () => {
      const editor = buildUser({ role: 'editor' });
      await userRepository.add(editor);
      const read = await userRepository.findById(tenantAId, editor.id);
      if (!read) throw new Error('the person just added is missing');
      // An admin switches them off after the read …
      await userRepository.saveAccess(
        User.fromProps({ ...editor.toProps(), isActive: false }),
      );

      // … and the language is written after: only it goes.
      read.changeLanguage('it');
      await userRepository.saveLanguage(read);

      const stored = await userRepository.findById(tenantAId, editor.id);
      expect(stored?.language).toBe('it');
      expect(stored?.isActive).toBe(false);
    });

    it('reads a language Kometio does not speak as none chosen', async () => {
      const user = buildUser({ language: 'it' });
      await userRepository.add(user);
      await withTenant(db, tenantAId, (tx) =>
        tx.update(users).set({ language: 'fr' }).where(eq(users.id, user.id)),
      );

      expect(
        (await userRepository.findById(tenantAId, user.id))?.language,
      ).toBeNull();
    });
  });

  describe('saveInviteAccepted', () => {
    it('writes the password and the accepted state, and leaves the role an admin set', async () => {
      const invitee = buildUser({
        role: 'editor',
        isActive: false,
        invitePending: true,
      });
      await userRepository.add(invitee);
      // Read before an admin gives them another role …
      const read = await userRepository.findById(tenantAId, invitee.id);
      if (!read) throw new Error('the invitee just added is missing');
      await userRepository.saveAccess(
        User.fromProps({ ...invitee.toProps(), role: 'publisher' }),
      );

      // … and accepted after.
      read.changePasswordHash('the-chosen-hash');
      read.acceptInvite();
      expect(await userRepository.saveInviteAccepted(read)).toBe(true);

      const stored = await userRepository.findById(tenantAId, invitee.id);
      expect(stored?.passwordHash).toBe('the-chosen-hash');
      expect(stored?.isActive).toBe(true);
      expect(stored?.invitePending).toBe(false);
      expect(stored?.role).toBe('publisher');
    });

    it('changes nothing for somebody who is no longer pending, and says so', async () => {
      const active = buildUser();
      await userRepository.add(active);
      const attempt = User.fromProps({
        ...active.toProps(),
        passwordHash: 'an-old-invitation-speaking',
      });

      expect(await userRepository.saveInviteAccepted(attempt)).toBe(false);

      expect(
        (await userRepository.findById(tenantAId, active.id))?.passwordHash,
      ).toBe('irrelevant-for-this-suite');
    });

    it('does not reach a person of another tenant', async () => {
      const invitee = buildUser({ isActive: false, invitePending: true });
      await userRepository.add(invitee);

      expect(
        await userRepository.saveInviteAccepted(
          User.fromProps({ ...invitee.toProps(), tenantId: tenantBId }),
        ),
      ).toBe(false);
    });
  });

  describe('saveAccess', () => {
    it('lets exactly one of two simultaneous demotions through, so an admin remains', async () => {
      // Ten pairs at once, each in a tenant of its own, on a pool already
      // holding open connections: one pair alone never overlapped, because
      // the second transaction spent its head start opening a connection.
      const pairs = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const tenantId = await createIntegrationTenant(
            db,
            'Integration Admins',
          );
          const first = buildUser({ tenantId });
          const second = buildUser({ tenantId });
          await userRepository.add(first);
          await userRepository.add(second);
          first.changeRole('editor');
          second.changeRole('editor');
          return { tenantId, first, second };
        }),
      );
      try {
        const outcomes = await Promise.all(
          pairs.map(({ first, second }) =>
            Promise.allSettled([
              userRepository.saveAccess(first),
              userRepository.saveAccess(second),
            ]),
          ),
        );

        for (const pair of outcomes) {
          expect(pair.map((outcome) => outcome.status).sort()).toEqual([
            'fulfilled',
            'rejected',
          ]);
          const refusal = pair.find(
            (outcome): outcome is PromiseRejectedResult =>
              outcome.status === 'rejected',
          );
          expect(refusal?.reason).toBeInstanceOf(LastActiveAdminError);
        }
        for (const { tenantId, first, second } of pairs) {
          const roles = await Promise.all(
            [first.id, second.id].map(
              async (id) => (await userRepository.findById(tenantId, id))?.role,
            ),
          );
          expect(roles.filter((role) => role === 'admin')).toHaveLength(1);
        }
      } finally {
        await deleteIntegrationTenants(
          db,
          pairs.map(({ tenantId }) => tenantId),
        );
      }
    });

    it('writes role and status and nothing else', async () => {
      const admin = buildUser();
      const editor = buildUser({ role: 'editor' });
      await userRepository.add(admin);
      await userRepository.add(editor);
      editor.changeRole('publisher');
      editor.deactivate();

      await userRepository.saveAccess(editor);

      const stored = await userRepository.findById(tenantAId, editor.id);
      expect(stored?.role).toBe('publisher');
      expect(stored?.isActive).toBe(false);
      expect(stored?.email).toBe(editor.email);
    });
  });

  /*
   * Ordered by creation time alone, users created in the same instant came
   * back in any order, and a page boundary between them showed one twice
   * and another never (audit B13).
   */
  it('pages through users created in the same instant, each exactly once', async () => {
    const tenantId = await createIntegrationTenant(db, 'Integration Paging');
    try {
      const sameInstant = new Date('2026-09-29T10:00:00.000Z');
      const ids = Array.from({ length: 7 }, () => randomUUID());
      for (const id of ids) {
        await userRepository.add(
          User.fromProps({
            ...buildUser({ id, tenantId }).toProps(),
            createdAt: sameInstant,
          }),
        );
      }

      const seen: string[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const { items } = await userRepository.list(tenantId, {
          page,
          pageSize: 3,
        });
        seen.push(...items.map((user) => user.id));
      }

      // Each once, and in the one order the tie-break fixes — by id, newest
      // id first — rather than whichever order the rows happen to lie in.
      expect(seen).toEqual([...ids].sort().reverse());
    } finally {
      await deleteIntegrationTenants(db, [tenantId]);
    }
  });
});
