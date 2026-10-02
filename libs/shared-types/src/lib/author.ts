import { z } from 'zod';
import { pickedMediaSchema } from './content-model';

/**
 * The first segment of an author's address, by language:
 * `/it/autore/giulia-rossi`, `/en/author/giulia-rossi`.
 *
 * Keyed by the language subtag of the site's locale (`pt-BR` is `pt`),
 * written as a slug — what the word becomes once accents are gone, since
 * a URL segment here is always one. A language whose word does not survive
 * that (Japanese, Russian, Arabic…) and any code this list does not know
 * use `author`: an address that works is better than one in the reader's
 * script that the rest of the site's addresses could not match.
 */
export const AUTHOR_PATH_SEGMENTS: Readonly<Record<string, string>> = {
  cs: 'autor',
  da: 'forfatter',
  de: 'autor',
  en: 'author',
  es: 'autor',
  fi: 'kirjoittaja',
  fr: 'auteur',
  hr: 'autor',
  hu: 'szerzo',
  id: 'penulis',
  it: 'autore',
  lt: 'autorius',
  lv: 'autors',
  nb: 'forfatter',
  nl: 'auteur',
  pl: 'autor',
  pt: 'autor',
  ro: 'autor',
  sk: 'autor',
  sl: 'avtor',
  sv: 'forfattare',
  tr: 'yazar',
  vi: 'tac-gia',
};

const FALLBACK_AUTHOR_PATH_SEGMENT = 'author';

/**
 * Every word an author's address can start with, in any language — what a
 * taxonomy's prefix may not be, or its terms would sit at the authors'
 * addresses (docs/adr/0071).
 */
export const RESERVED_AUTHOR_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  ...Object.values(AUTHOR_PATH_SEGMENTS),
  FALLBACK_AUTHOR_PATH_SEGMENT,
]);

/**
 * How long an address made from a name may be. A name is not a sentence,
 * and the address is typed, shared and read aloud.
 */
export const AUTHOR_SLUG_MAX_LENGTH = 80;

export function authorPathSegment(locale: string): string {
  const language = locale.split('-')[0]?.toLowerCase() ?? '';
  return AUTHOR_PATH_SEGMENTS[language] ?? FALLBACK_AUTHOR_PATH_SEGMENT;
}

/**
 * A person as the site shows them: what they chose to fill in, and never
 * their email or their role in the editor.
 */
export const publicAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** In the language being read; empty when they wrote none in it. */
  bio: z.string(),
  avatar: pickedMediaSchema.nullable(),
  /** `null` when they have no page to go to — no published article in this language. */
  path: z.string().nullable(),
});

export type PublicAuthor = z.infer<typeof publicAuthorSchema>;

/**
 * Who wrote this: a picture, a name, a few lines about them.
 *
 * FILLED BY THE RENDER PASS, like ArticleMeta — from the page's own author
 * on an article, from the person themselves on their author page. Nothing
 * in it is authorable except whether to show the bio and the link: a bio
 * typed into a block would be a second, stale copy of the one in the
 * person's profile.
 */
export const authorBoxPropsSchema = z.object({
  showBio: z.boolean().default(true),
  /** "All articles by …", to their author page — when they have one. */
  showArticlesLink: z.boolean().default(true),
  /** Filled. `null` when the page has no author with a name to show, and then nothing is drawn. */
  author: publicAuthorSchema.nullable().default(null),
  /**
   * Filled, and only on the author's own page: the name is that page's
   * `<h1>` and the box says so to schema.org (ProfilePage). Not a field —
   * a byline under an article is not the title of the page it is on.
   */
  isProfilePage: z.boolean().default(false),
});

export type AuthorBoxProps = z.infer<typeof authorBoxPropsSchema>;

/** What a person may do in the editor — the one list the domain, the wire and the `user_role` enum read. */
export const USER_ROLES = ['admin', 'publisher', 'editor'] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export type UserRole = (typeof USER_ROLES)[number];
