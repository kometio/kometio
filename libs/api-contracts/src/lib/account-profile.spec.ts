import { describe, expect, it } from 'vitest';
import { accountProfileSchema } from './account-profile';

describe('accountProfileSchema', () => {
  const profile = {
    id: 'u1',
    email: 'ada@esempio.test',
    role: 'admin',
    displayName: 'Ada Esempio',
    slug: 'ada',
    bio: { it: 'Scrive di caffè.', en: '' },
    avatarUrl: null,
    language: null,
  };

  it('accepts a profile whose bio is one text per language', () => {
    expect(accountProfileSchema.parse(profile)).toEqual(profile);
  });

  it.each(['it', 'en'])(
    'accepts %s as the language the person chose',
    (language) => {
      expect(
        accountProfileSchema.parse({ ...profile, language }).language,
      ).toBe(language);
    },
  );

  it('refuses a language the emails are not written in, and a profile without the field', () => {
    expect(
      accountProfileSchema.safeParse({ ...profile, language: 'fr' }).success,
    ).toBe(false);
    const without = Object.fromEntries(
      Object.entries(profile).filter(([field]) => field !== 'language'),
    );
    expect(accountProfileSchema.safeParse(without).success).toBe(false);
  });

  it('refuses a bio that is a single string', () => {
    expect(
      accountProfileSchema.safeParse({ ...profile, bio: 'Scrive di caffè.' })
        .success,
    ).toBe(false);
  });
});
