import { describe, expect, it } from 'vitest';
import { isCanonicalSlug, slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Chi Siamo')).toBe('chi-siamo');
  });

  it('strips accents', () => {
    expect(slugify('Perché')).toBe('perche');
  });

  it('strips punctuation and collapses runs of separators into one hyphen', () => {
    expect(slugify('  Café & Bar!!  ')).toBe('cafe-bar');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('-già pronto-')).toBe('gia-pronto');
  });
});

describe('isCanonicalSlug', () => {
  it('accepts what slugify leaves as it is', () => {
    expect(isCanonicalSlug('chi-siamo')).toBe(true);
    expect(isCanonicalSlug('2026')).toBe(true);
  });

  it.each(['wp-login.php', '.env', 'Chi-Siamo', 'a b', '-x', 'perché', ''])(
    'refuses "%s"',
    (value) => {
      expect(isCanonicalSlug(value)).toBe(false);
    },
  );
});
