import { randomUUID } from 'node:crypto';
import {
  AvatarNotAnImageError,
  classifyUpload,
  InvalidUserSlugError,
  MediaTooLargeError,
  UserNotFoundError,
  UserSlugAlreadyExistsError,
  type User,
} from '@kometio/domain-core';
import type { MediaStoragePort, UserRepositoryPort } from '@kometio/ports';
import { isCanonicalSlug, type InterfaceLanguage } from '@kometio/shared-types';
import { type AccountProfile } from '@kometio/api-contracts';
import { chooseAuthorSlug } from './author-profile';
import { MAX_UPLOAD_BYTES_BY_KIND } from './upload-media.use-case';

export interface AccountProfileDeps {
  userRepository: UserRepositoryPort;
  mediaStorage: MediaStoragePort;
}

interface AccountRef {
  tenantId: string;
  userId: string;
}

async function loadUser(
  deps: Pick<AccountProfileDeps, 'userRepository'>,
  account: AccountRef,
): Promise<User> {
  const user = await deps.userRepository.findById(
    account.tenantId,
    account.userId,
  );
  if (!user) throw new UserNotFoundError(account.userId);
  return user;
}

function toAccountProfile(
  user: User,
  media: Pick<MediaStoragePort, 'getUrl'>,
): AccountProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    slug: user.slug,
    bio: { ...user.bio },
    avatarUrl: user.avatar ? media.getUrl(user.avatar.storageKey) : null,
    language: user.language,
  };
}

/** The signed-in person's own profile. */
export async function getAccountProfile(
  deps: AccountProfileDeps,
  account: AccountRef,
): Promise<AccountProfile> {
  return toAccountProfile(await loadUser(deps, account), deps.mediaStorage);
}

export interface UpdateAccountProfileInput extends AccountRef {
  /** Empty or blank clears it. */
  displayName: string;
  /**
   * The author address they chose, or `null` to leave it as it is. A
   * person who has none yet is given one made from their name the first
   * time they have a name — they never have to think about it unless they
   * want to.
   */
  slug: string | null;
  bio: Record<string, string>;
}

/**
 * What a person says about themselves: their name, their author address
 * and their bio.
 *
 * The address is checked against every other person's current AND former
 * addresses (`isSlugTaken`): handing someone a former address would turn
 * a working redirect into a page about somebody else. It is checked again
 * by the database's unique constraint, for two people saving the same one
 * at the same moment.
 */
export async function updateAccountProfile(
  deps: AccountProfileDeps,
  input: UpdateAccountProfileInput,
): Promise<AccountProfile> {
  const user = await loadUser(deps, input);
  const displayName = input.displayName.trim();
  user.changeDisplayName(displayName === '' ? null : displayName);
  user.changeBio(input.bio);

  if (input.slug !== null && input.slug !== user.slug) {
    if (!isCanonicalSlug(input.slug)) {
      // The API's schema refuses it first; this is the rule, not the form.
      throw new InvalidUserSlugError(input.slug);
    }
    if (
      await deps.userRepository.isSlugTaken(input.tenantId, input.slug, user.id)
    ) {
      throw new UserSlugAlreadyExistsError(input.slug);
    }
    user.changeSlug(input.slug);
  } else if (user.slug === null && user.displayName) {
    const chosen = await chooseAuthorSlug(
      deps,
      input.tenantId,
      user.displayName,
      user.id,
    );
    if (chosen) user.changeSlug(chosen);
  }

  await deps.userRepository.saveProfile(user);
  return toAccountProfile(user, deps.mediaStorage);
}

export interface ChangeAccountLanguageInput extends AccountRef {
  language: InterfaceLanguage;
}

/**
 * The language the editor and every email speak to this person in — chosen
 * from the language selector, and written at once (docs/adr/0100).
 */
export async function changeAccountLanguage(
  deps: AccountProfileDeps,
  input: ChangeAccountLanguageInput,
): Promise<AccountProfile> {
  const user = await loadUser(deps, input);
  user.changeLanguage(input.language);
  await deps.userRepository.saveLanguage(user);
  return toAccountProfile(user, deps.mediaStorage);
}

export interface ChangeAccountAvatarInput extends AccountRef {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * A new profile picture, stored the way an uploaded image is (re-encoded,
 * ADR-0013) and kept out of the site's library.
 *
 * The bytes decide whether it is a picture, not the name or the declared
 * type — the same rule the library follows (ADR-0070). The picture it
 * replaces is deleted once the new one is saved; failing to delete it
 * leaves an orphan file, never a person without a picture.
 */
export async function changeAccountAvatar(
  deps: AccountProfileDeps,
  input: ChangeAccountAvatarInput,
): Promise<AccountProfile> {
  const user = await loadUser(deps, input);
  const classified = classifyUpload(input.data, input.filename);
  if (!classified.inline || classified.kind !== 'image') {
    throw new AvatarNotAnImageError();
  }
  // The library's ceiling for a photo: a picture uploaded from the profile
  // is still a photo held in one request's memory.
  if (input.data.byteLength > MAX_UPLOAD_BYTES_BY_KIND.image) {
    throw new MediaTooLargeError('image', MAX_UPLOAD_BYTES_BY_KIND.image);
  }
  const uploaded = await deps.mediaStorage.upload({
    tenantId: input.tenantId,
    // A person's picture, not a site's: the same on every site they write for.
    siteId: null,
    // The person's name is not written into storage: the key is all
    // anyone needs, and a filename can carry more than it should.
    filename: `avatar-${randomUUID()}.${classified.extension}`,
    mimeType: classified.mimeType,
    data: input.data,
  });
  const previous = user.changeAvatar({
    storageKey: uploaded.storageKey,
    width: uploaded.width,
    height: uploaded.height,
  });
  await deps.userRepository.saveAvatar(user);
  if (previous) {
    await deps.mediaStorage.delete(previous.storageKey).catch(() => undefined);
  }
  return toAccountProfile(user, deps.mediaStorage);
}

/** Back to the initial on a coloured circle. */
export async function removeAccountAvatar(
  deps: AccountProfileDeps,
  account: AccountRef,
): Promise<AccountProfile> {
  const user = await loadUser(deps, account);
  const previous = user.changeAvatar(null);
  await deps.userRepository.saveAvatar(user);
  if (previous) {
    await deps.mediaStorage.delete(previous.storageKey).catch(() => undefined);
  }
  return toAccountProfile(user, deps.mediaStorage);
}
