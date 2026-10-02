import { beforeEach, describe, expect, it } from 'vitest';
import {
  AvatarNotAnImageError,
  MediaTooLargeError,
  InvalidUserSlugError,
  User,
  UserSlugAlreadyExistsError,
} from '@kometio/domain-core';
import { InMemoryMediaStorage, InMemoryUserRepository } from '@kometio/testing';
import {
  changeAccountAvatar,
  changeAccountLanguage,
  getAccountProfile,
  removeAccountAvatar,
  updateAccountProfile,
} from './account-profile.use-cases';
import { inviteUser } from './invite-user.use-case';
import { FakeAuthPort } from '@kometio/testing';
import { FakeDeploymentLocale } from '@kometio/testing';
import { FakeEmailPort } from '@kometio/testing';
import { FakeVerificationTokenPort } from '@kometio/testing';

const tenantId = 'tenant-1';
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

describe('account profile', () => {
  let deps: {
    userRepository: InMemoryUserRepository;
    mediaStorage: InMemoryMediaStorage;
  };

  async function seedUser(
    id: string,
    options: { displayName?: string | null; slug?: string | null } = {},
  ) {
    const user = User.create({
      id,
      tenantId,
      email: `${id}@example.test`,
      displayName: options.displayName ?? '',
      passwordHash: 'x',
      role: 'editor',
      slug: options.slug ?? null,
    });
    if (options.displayName === null) user.changeDisplayName(null);
    await deps.userRepository.add(user);
    return user;
  }

  const update = (
    userId: string,
    input: Partial<{
      displayName: string;
      slug: string | null;
      bio: Record<string, string>;
    }>,
  ) =>
    updateAccountProfile(deps, {
      tenantId,
      userId,
      displayName: input.displayName ?? '',
      slug: input.slug ?? null,
      bio: input.bio ?? {},
    });

  beforeEach(() => {
    deps = {
      userRepository: new InMemoryUserRepository(),
      mediaStorage: new InMemoryMediaStorage(),
    };
  });

  it('never tells the person anything the site would not: it is their own data, email and role included', async () => {
    await seedUser('u1', { displayName: 'Giulia Rossi', slug: 'giulia-rossi' });

    expect(await getAccountProfile(deps, { tenantId, userId: 'u1' })).toEqual({
      id: 'u1',
      email: 'u1@example.test',
      role: 'editor',
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {},
      avatarUrl: null,
      language: null,
    });
  });

  it('gives a person their author address the first time they have a name', async () => {
    await seedUser('u1', { displayName: null });

    const profile = await update('u1', { displayName: '  Giulia Rossi ' });

    expect(profile.displayName).toBe('Giulia Rossi');
    expect(profile.slug).toBe('giulia-rossi');
  });

  it('numbers the address when the name is already somebody else’s, current or former', async () => {
    await seedUser('taken', {
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
    });
    const other = await seedUser('moved', {
      displayName: 'Giulia R',
      slug: 'giulia-rossi-2',
    });
    other.changeSlug('g-rossi');
    await deps.userRepository.saveProfile(other);
    await seedUser('u1', { displayName: null });

    expect((await update('u1', { displayName: 'Giulia Rossi' })).slug).toBe(
      'giulia-rossi-3',
    );
  });

  it('does not move the address when the person renames themselves — every link to their articles would break', async () => {
    await seedUser('u1', { displayName: 'Giulia Rossi', slug: 'giulia-rossi' });

    expect((await update('u1', { displayName: 'Giulia Bianchi' })).slug).toBe(
      'giulia-rossi',
    );
  });

  it('moves the address when they choose one, and the old one keeps redirecting', async () => {
    await seedUser('u1', { displayName: 'Giulia', slug: 'giulia' });

    await update('u1', { displayName: 'Giulia', slug: 'giulia-rossi' });

    const user = await deps.userRepository.findById(tenantId, 'u1');
    expect(user?.slug).toBe('giulia-rossi');
    expect(user?.formerSlugs).toEqual(['giulia']);
  });

  it('refuses an address another person has now, or used to have', async () => {
    const other = await seedUser('other', {
      displayName: 'Anna',
      slug: 'anna',
    });
    other.changeSlug('anna-b');
    await deps.userRepository.saveProfile(other);
    await seedUser('u1', { displayName: 'Mario', slug: 'mario' });

    await expect(
      update('u1', { displayName: 'Mario', slug: 'anna-b' }),
    ).rejects.toThrow(UserSlugAlreadyExistsError);
    await expect(
      update('u1', { displayName: 'Mario', slug: 'anna' }),
    ).rejects.toThrow(UserSlugAlreadyExistsError);
  });

  it('refuses an address that is not a slug', async () => {
    await seedUser('u1', { displayName: 'Mario', slug: 'mario' });

    await expect(
      update('u1', { displayName: 'Mario', slug: 'Mario Rossi' }),
    ).rejects.toThrow(InvalidUserSlugError);
  });

  it('keeps a bio only in the languages something was written in', async () => {
    await seedUser('u1', { displayName: 'Mario', slug: 'mario' });

    const profile = await update('u1', {
      displayName: 'Mario',
      bio: { it: ' Cuoco a Bologna ', en: '  ', fr: 'Cuisinier' },
    });

    expect(profile.bio).toEqual({ it: 'Cuoco a Bologna', fr: 'Cuisinier' });
  });

  it('makes the address from a long name no longer than an address should be', async () => {
    await seedUser('u1', { displayName: null, slug: null });

    const profile = await updateAccountProfile(deps, {
      tenantId,
      userId: 'u1',
      displayName: `${'Maria '.repeat(20)}Rossi`,
      slug: null,
      bio: {},
    });

    expect(profile.slug?.length).toBeLessThanOrEqual(80);
    expect(profile.slug).toMatch(/^maria-maria-.*[a-z]$/);
  });

  describe('the picture', () => {
    it('stores an image, shows its address, and deletes the one it replaces', async () => {
      await seedUser('u1', { displayName: 'Mario', slug: 'mario' });
      const upload = () =>
        changeAccountAvatar(deps, {
          tenantId,
          userId: 'u1',
          filename: 'me.png',
          mimeType: 'image/png',
          data: PNG,
        });

      const first = await upload();
      expect(first.avatarUrl).toBe('https://fake-storage.test/fake-1.webp');
      // The person's own file name is not what storage keeps.
      expect(deps.mediaStorage.uploads[0]?.filename).not.toContain('me');

      await upload();
      expect(deps.mediaStorage.deletedKeys).toEqual(['fake-1.webp']);
    });

    it('refuses anything whose bytes are not an image, whatever it is called', async () => {
      await seedUser('u1', { displayName: 'Mario', slug: 'mario' });

      await expect(
        changeAccountAvatar(deps, {
          tenantId,
          userId: 'u1',
          filename: 'me.png',
          mimeType: 'image/png',
          data: new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
        }),
      ).rejects.toThrow(AvatarNotAnImageError);
      expect(deps.mediaStorage.uploads).toEqual([]);
    });

    it('refuses a picture larger than the library would take', async () => {
      await seedUser('u1', { displayName: 'Mario', slug: 'mario' });
      const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
      oversized.set(PNG);

      await expect(
        changeAccountAvatar(deps, {
          tenantId,
          userId: 'u1',
          filename: 'me.png',
          mimeType: 'image/png',
          data: oversized,
        }),
      ).rejects.toThrow(MediaTooLargeError);
      expect(deps.mediaStorage.uploads).toEqual([]);
    });

    it('goes back to no picture and deletes the stored one', async () => {
      await seedUser('u1', { displayName: 'Mario', slug: 'mario' });
      await changeAccountAvatar(deps, {
        tenantId,
        userId: 'u1',
        filename: 'me.png',
        mimeType: 'image/png',
        data: PNG,
      });

      const profile = await removeAccountAvatar(deps, {
        tenantId,
        userId: 'u1',
      });

      expect(profile.avatarUrl).toBeNull();
      expect(deps.mediaStorage.deletedKeys).toEqual(['fake-1.webp']);
    });
  });
  describe('the language', () => {
    it('is none in the profile until one is chosen', async () => {
      await seedUser('u1');

      expect(
        (await getAccountProfile(deps, { tenantId, userId: 'u1' })).language,
      ).toBeNull();
    });

    it('is written at once and comes back in the profile', async () => {
      await seedUser('u1');

      const profile = await changeAccountLanguage(deps, {
        tenantId,
        userId: 'u1',
        language: 'en',
      });

      expect(profile.language).toBe('en');
      expect(
        (await deps.userRepository.findById(tenantId, 'u1'))?.language,
      ).toBe('en');
    });

    it('does not bring back a name saved a moment before', async () => {
      await seedUser('u1', { displayName: 'Giulia Rossi' });
      const { userRepository } = deps;
      // The name is saved while the language is being chosen.
      userRepository.afterTheNextReadOf('u1', async () => {
        const current = await userRepository.findById(tenantId, 'u1');
        if (!current) throw new Error('missing');
        current.changeDisplayName('Giulia Bianchi');
        await userRepository.saveProfile(current);
      });

      await changeAccountLanguage(deps, {
        tenantId,
        userId: 'u1',
        language: 'it',
      });

      expect((await userRepository.findById(tenantId, 'u1'))?.displayName).toBe(
        'Giulia Bianchi',
      );
    });
  });
});

describe('inviting someone gives them an author address from their name', () => {
  it('assigns it at once, numbered around one already taken', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.add(
      User.create({
        id: 'existing',
        tenantId,
        email: 'existing@example.test',
        displayName: 'Luca Verdi',
        passwordHash: 'x',
        role: 'editor',
        slug: 'luca-verdi',
      }),
    );

    const invited = await inviteUser(
      {
        userRepository,
        authPort: new FakeAuthPort(),
        verificationTokenPort: new FakeVerificationTokenPort(),
        emailPort: new FakeEmailPort(),
        deploymentLocale: new FakeDeploymentLocale(),
      },
      {
        tenantId,
        email: 'luca@example.test',
        displayName: 'Luca Verdi',
        role: 'editor',
        inviteUrlBase: 'https://editor.test',
      },
    );

    expect(invited.slug).toBe('luca-verdi-2');
  });
});
