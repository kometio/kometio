import { describe, expect, it } from 'vitest';
import { isCanonicalSlug } from './slugify';
import {
  AUTHOR_PATH_SEGMENTS,
  authorBoxPropsSchema,
  authorPathSegment,
} from './author';

describe('authorPathSegment', () => {
  it('uses the word of the language being read', () => {
    expect(authorPathSegment('it')).toBe('autore');
    expect(authorPathSegment('en')).toBe('author');
    expect(authorPathSegment('fr')).toBe('auteur');
  });

  it('reads the language of a locale with a region', () => {
    expect(authorPathSegment('pt-BR')).toBe('autor');
    expect(authorPathSegment('it-IT')).toBe('autore');
  });

  it('falls back to "author" for a language it has no slug for', () => {
    expect(authorPathSegment('ja-JP')).toBe('author');
    expect(authorPathSegment('xx')).toBe('author');
  });

  // The route compares a URL segment with this word, and a URL segment is
  // only ever looked up when it is a slug: a word that is not one would be
  // an address nobody can reach.
  it.each(Object.entries(AUTHOR_PATH_SEGMENTS))(
    'writes %s as a slug (%s)',
    (_, segment) => {
      expect(isCanonicalSlug(segment)).toBe(true);
    },
  );
});

describe('authorBoxPropsSchema', () => {
  it('starts with no author, a bio and a link, and is not a profile page', () => {
    expect(authorBoxPropsSchema.parse({})).toEqual({
      showBio: true,
      showArticlesLink: true,
      author: null,
      isProfilePage: false,
    });
  });
});
