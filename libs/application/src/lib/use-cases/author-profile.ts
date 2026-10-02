import {
  AUTHOR_SLUG_MAX_LENGTH,
  authorPathSegment,
  slugify,
  type PickedMedia,
  type PublicAuthor,
} from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import type { MediaStoragePort, UserRepositoryPort } from '@kometio/ports';
import type { User, UserAvatar } from '@kometio/domain-core';
import type { PublishedPagePath } from './list-published-page-paths';

/** Only the URL of a stored file — all a read path needs from storage. */
export type MediaUrlResolver = Pick<MediaStoragePort, 'getUrl'>;

/**
 * How many numbered alternatives are tried before giving up on a name.
 * Twenty people called "Mario Rossi" in one newsroom is already far past
 * anything real; past it the person picks their own address.
 */
const MAX_SLUG_ATTEMPTS = 20;

/**
 * A free author address made from a person's name — `giulia-rossi`, then
 * `giulia-rossi-2`, `giulia-rossi-3` — or `null` when the name gives no
 * slug at all (a name written only in a script slugify drops) or every
 * numbered form is taken. A person without one simply has no author page
 * until they choose an address themselves.
 */
export async function chooseAuthorSlug(
  deps: { userRepository: UserRepositoryPort },
  tenantId: string,
  name: string,
  exceptUserId: string | null,
): Promise<string | null> {
  // Cut on a whole character of the slug, and never left ending on the
  // hyphen the cut fell after.
  const base = slugify(name)
    .slice(0, AUTHOR_SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  if (!base) return null;
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (
      !(await deps.userRepository.isSlugTaken(
        tenantId,
        candidate,
        exceptUserId,
      ))
    ) {
      return candidate;
    }
  }
  return null;
}

/** `/it/autore/giulia-rossi`. */
export function authorPath(locale: string, slug: string): string {
  return localePathFromAncestors(locale, [authorPathSegment(locale)], slug);
}

/**
 * The stored picture as a block can draw it. Its size travels with it so
 * the site's image component can optimise it (OptimizedImage wants both).
 */
export function avatarMedia(
  avatar: UserAvatar | null,
  media: MediaUrlResolver | undefined,
): PickedMedia | null {
  if (!avatar || !media) return null;
  return {
    mediaId: `avatar:${avatar.storageKey}`,
    url: media.getUrl(avatar.storageKey),
    width: avatar.width,
    height: avatar.height,
  };
}

/** Published articles of one language — what an author page lists and asks about. */
export function articlesIn(
  paths: readonly PublishedPagePath[],
  locale: string,
): PublishedPagePath[] {
  return paths.filter(
    (path) => path.locale === locale && path.collectionId !== null,
  );
}

/**
 * Whether this person has an author page in this language: someone still
 * on the team, with a name to put on it, an address that no page of the
 * site already answers at, and at least one published article there.
 *
 * Articles are the pages a collection lists (the editor's News, Blog…):
 * the home page or a privacy policy an admin created is not writing. The
 * page at the same address wins it (a page always does), so the person
 * then has no page — rather than a byline and a sitemap entry pointing at
 * somebody else's.
 */
export function hasAuthorPage(
  user: User,
  locale: string,
  paths: readonly PublishedPagePath[],
): boolean {
  const slug = user.slug;
  if (!user.isActive || !user.displayName?.trim() || !slug) {
    return false;
  }
  const segment = authorPathSegment(locale);
  const takenByAPage = paths.some(
    (path) =>
      path.locale === locale &&
      path.slug === slug &&
      path.ancestorSlugs.length === 1 &&
      path.ancestorSlugs[0] === segment,
  );
  return (
    !takenByAPage &&
    articlesIn(paths, locale).some((path) => path.authorUserId === user.id)
  );
}

/**
 * A person as the site shows them — never their email, never their role.
 *
 * Someone who has left the team keeps their name on what they wrote, and
 * nothing else: no picture, no bio, no page. Those were theirs to publish
 * while they were here, and nobody else can take them down for them.
 */
export function toPublicAuthor(
  user: User,
  locale: string,
  paths: readonly PublishedPagePath[],
  media: MediaUrlResolver | undefined,
): PublicAuthor {
  const name = user.displayName?.trim() ?? '';
  if (!user.isActive) {
    return { id: user.id, name, bio: '', avatar: null, path: null };
  }
  return {
    id: user.id,
    name,
    bio: user.bio[locale] ?? '',
    avatar: avatarMedia(user.avatar, media),
    path:
      user.slug && hasAuthorPage(user, locale, paths)
        ? authorPath(locale, user.slug)
        : null,
  };
}
