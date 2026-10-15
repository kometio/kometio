import { describe, expect, it } from 'vitest';
import {
  applyStarterBodySchema,
  applyStarterResponseSchema,
  starterOfferSchema,
} from './starters';

describe('applyStarterBodySchema', () => {
  it.each(['studio', 'portfolio', 'blog'])('takes %s', (starterId) => {
    expect(applyStarterBodySchema.safeParse({ starterId }).success).toBe(true);
  });

  it.each([{}, { starterId: 'shop' }, { starterId: '' }, { starterId: 3 }])(
    'refuses %j: the one to make is one of the three',
    (body) => {
      expect(applyStarterBodySchema.safeParse(body).success).toBe(false);
    },
  );

  it('does not take a language: the site’s is the one', () => {
    const parsed = applyStarterBodySchema.parse({
      starterId: 'blog',
      language: 'it',
    });

    expect(parsed).toEqual({ starterId: 'blog' });
  });
});

describe('starterOfferSchema', () => {
  it('reads what the API answers a new site', () => {
    const offer = starterOfferSchema.parse({
      available: true,
      language: 'it',
      fallback: false,
      starters: ['studio', 'portfolio', 'blog'],
    });

    expect(offer.starters).toHaveLength(3);
  });

  it('refuses a language there is no text in', () => {
    expect(
      starterOfferSchema.safeParse({
        available: true,
        language: 'fr',
        fallback: true,
        starters: [],
      }).success,
    ).toBe(false);
  });
});

describe('applyStarterResponseSchema', () => {
  it('counts at least the home page', () => {
    expect(
      applyStarterResponseSchema.safeParse({
        starterId: 'studio',
        language: 'en',
        fallback: true,
        pages: 0,
      }).success,
    ).toBe(false);
  });
});
