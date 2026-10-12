import { describe, expect, it } from 'vitest';
import { PAGE_SLUG_MAX_LENGTH } from '@kometio/shared-types';
import { pagePathSchema, pageSlugSchema } from './page-slug';

describe('pageSlugSchema', () => {
  it('takes a slug in its canonical form', () => {
    expect(pageSlugSchema.safeParse('chi-siamo').success).toBe(true);
  });

  it.each(['Chi Siamo', 'chi_siamo', 'chi--siamo', '-chi', ''])(
    'refuses %j: an address is never what a client computed',
    (slug) => {
      expect(pageSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it('refuses one longer than an address segment may be', () => {
    expect(
      pageSlugSchema.safeParse('a'.repeat(PAGE_SLUG_MAX_LENGTH + 1)).success,
    ).toBe(false);
  });
});

describe('pagePathSchema', () => {
  it('splits a path into its segments, root to leaf', () => {
    expect(pagePathSchema.parse('servizi/idraulica')).toEqual([
      'servizi',
      'idraulica',
    ]);
  });

  it('ignores the slashes at the ends and doubled', () => {
    expect(pagePathSchema.parse('/servizi//idraulica/')).toEqual([
      'servizi',
      'idraulica',
    ]);
  });

  it.each(['', '/', 'Servizi/idraulica', 'servizi/Idraulica Casa'])(
    'refuses %j',
    (path) => {
      expect(pagePathSchema.safeParse(path).success).toBe(false);
    },
  );
});
