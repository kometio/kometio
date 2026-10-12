import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';
import {
  acceptInviteBodySchema,
  confirmEmailChangeBodySchema,
  loginBodySchema,
  newPasswordSchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from './auth-requests';

const password = 'p'.repeat(MIN_PASSWORD_LENGTH);

describe('newPasswordSchema', () => {
  it('takes the shortest password the rule allows and refuses one character fewer', () => {
    expect(newPasswordSchema.safeParse(password).success).toBe(true);
    expect(newPasswordSchema.safeParse(password.slice(1)).success).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('takes an email and a password, and makes a missing captcha token an empty one', () => {
    const parsed = loginBodySchema.parse({
      email: 'ada@example.test',
      password: 'whatever it was',
    });

    expect(parsed.captchaToken).toBe('');
  });

  it('does not ask a password to meet today’s rule: one chosen before it must still sign in', () => {
    expect(
      loginBodySchema.safeParse({ email: 'ada@example.test', password: 'x' })
        .success,
    ).toBe(true);
  });

  it.each([
    ['an email that is not one', { email: 'ada', password: 'x' }],
    ['an empty password', { email: 'ada@example.test', password: '' }],
  ])('refuses %s', (_name, body) => {
    expect(loginBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('the token bodies', () => {
  it.each([
    ['verifyEmailBodySchema', verifyEmailBodySchema],
    ['confirmEmailChangeBodySchema', confirmEmailChangeBodySchema],
  ])('%s takes a token and refuses an empty one', (_name, schema) => {
    expect(schema.safeParse({ token: 'abc' }).success).toBe(true);
    expect(schema.safeParse({ token: '' }).success).toBe(false);
  });
});

describe('requestPasswordResetBodySchema', () => {
  it('takes an email, with the captcha token optional', () => {
    expect(
      requestPasswordResetBodySchema.parse({ email: 'ada@example.test' })
        .captchaToken,
    ).toBe('');
    expect(
      requestPasswordResetBodySchema.safeParse({ email: 'nope' }).success,
    ).toBe(false);
  });
});

describe('the bodies that set a password', () => {
  it('holds the new password of a reset to the rule', () => {
    expect(
      resetPasswordBodySchema.safeParse({ token: 't', newPassword: password })
        .success,
    ).toBe(true);
    expect(
      resetPasswordBodySchema.safeParse({
        token: 't',
        newPassword: password.slice(1),
      }).success,
    ).toBe(false);
  });

  it('holds the password of an accepted invitation to it too', () => {
    expect(
      acceptInviteBodySchema.safeParse({ token: 't', password }).success,
    ).toBe(true);
    expect(
      acceptInviteBodySchema.safeParse({ token: 't', password: 'short' })
        .success,
    ).toBe(false);
  });
});
