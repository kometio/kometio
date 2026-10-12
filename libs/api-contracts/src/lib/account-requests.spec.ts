import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';
import {
  BIO_MAX_CHARS,
  changeAccountLanguageBodySchema,
  changePasswordBodySchema,
  requestEmailChangeBodySchema,
  updateAccountProfileBodySchema,
} from './account-requests';

const profile = { displayName: 'Ada', slug: 'ada', bio: { it: 'Ciao' } };

describe('updateAccountProfileBodySchema', () => {
  it('takes a profile, with the address left to be made (null)', () => {
    expect(updateAccountProfileBodySchema.safeParse(profile).success).toBe(
      true,
    );
    expect(
      updateAccountProfileBodySchema.safeParse({ ...profile, slug: null })
        .success,
    ).toBe(true);
  });

  it('holds the address to the rule of a page’s slug', () => {
    expect(
      updateAccountProfileBodySchema.safeParse({ ...profile, slug: 'Ada L.' })
        .success,
    ).toBe(false);
  });

  it('takes a bio keyed by a locale however a site spells it, and refuses a key that is not one', () => {
    for (const locale of ['it', 'pt-BR', 'EN', 'it_IT']) {
      expect(
        updateAccountProfileBodySchema.safeParse({
          ...profile,
          bio: { [locale]: 'x' },
        }).success,
      ).toBe(true);
    }
    expect(
      updateAccountProfileBodySchema.safeParse({
        ...profile,
        bio: { 'not a locale': 'x' },
      }).success,
    ).toBe(false);
  });

  it('bounds a bio, and the languages it is written in', () => {
    expect(
      updateAccountProfileBodySchema.safeParse({
        ...profile,
        bio: { it: 'x'.repeat(BIO_MAX_CHARS) },
      }).success,
    ).toBe(true);
    expect(
      updateAccountProfileBodySchema.safeParse({
        ...profile,
        bio: { it: 'x'.repeat(BIO_MAX_CHARS + 1) },
      }).success,
    ).toBe(false);
    const manyLanguages = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [
        `l${String(i).padStart(2, '0')}`,
        'x',
      ]),
    );
    expect(
      updateAccountProfileBodySchema.safeParse({
        ...profile,
        bio: manyLanguages,
      }).success,
    ).toBe(false);
  });

  it('bounds the display name', () => {
    expect(
      updateAccountProfileBodySchema.safeParse({
        ...profile,
        displayName: 'x'.repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe('changePasswordBodySchema', () => {
  it('asks the new password to meet the rule and the current one only to be there', () => {
    const ok = 'n'.repeat(MIN_PASSWORD_LENGTH);

    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'x',
        newPassword: ok,
      }).success,
    ).toBe(true);
    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: '',
        newPassword: ok,
      }).success,
    ).toBe(false);
    expect(
      changePasswordBodySchema.safeParse({
        currentPassword: 'x',
        newPassword: ok.slice(1),
      }).success,
    ).toBe(false);
  });
});

describe('requestEmailChangeBodySchema', () => {
  it('trims the address, as an invited one is', () => {
    const parsed = requestEmailChangeBodySchema.parse({
      newEmail: '  ada@example.test ',
      currentPassword: 'x',
    });

    expect(parsed.newEmail).toBe('ada@example.test');
  });

  it('refuses an address that is not one', () => {
    expect(
      requestEmailChangeBodySchema.safeParse({
        newEmail: 'ada',
        currentPassword: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('changeAccountLanguageBodySchema', () => {
  it('takes a language the editor has and refuses another', () => {
    expect(
      changeAccountLanguageBodySchema.safeParse({ language: 'it' }).success,
    ).toBe(true);
    expect(
      changeAccountLanguageBodySchema.safeParse({ language: 'fr' }).success,
    ).toBe(false);
  });
});
