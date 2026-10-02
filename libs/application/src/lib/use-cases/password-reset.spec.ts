import { describe, expect, it } from 'vitest';
import {
  InvalidCaptchaError,
  InvalidOrExpiredTokenError,
  User,
} from '@kometio/domain-core';
import { requestPasswordReset } from './request-password-reset.use-case';
import { resetPassword } from './reset-password.use-case';
import { InMemoryUserRepository } from '@kometio/testing';
import { FakeVerificationTokenPort } from '@kometio/testing';
import { FakeEmailPort } from '@kometio/testing';
import { FakeAuthPort } from '@kometio/testing';
import { FakeCaptchaPort } from '@kometio/testing';
import { FakeDeploymentLocale } from '@kometio/testing';

const tenantId = 'tenant-1';

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const verificationTokenPort = new FakeVerificationTokenPort();
  const emailPort = new FakeEmailPort();
  const authPort = new FakeAuthPort();
  const captchaPort = new FakeCaptchaPort();
  const user = User.create({
    id: 'user-1',
    tenantId,
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: await authPort.hashPassword('old-password'),
    role: 'admin',
  });
  await userRepository.add(user);
  return {
    userRepository,
    verificationTokenPort,
    emailPort,
    authPort,
    captchaPort,
    deploymentLocale: new FakeDeploymentLocale(),
    user,
  };
}

describe('requestPasswordReset', () => {
  it('sends a reset email with a working link for a known email', async () => {
    const deps = await setup();

    await requestPasswordReset(deps, {
      tenantId,
      email: 'lele@example.com',
      resetUrlBase: 'https://editor.example.com/',
      captchaToken: 'valid-token',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].html).toContain(
      'https://editor.example.com/reset-password?resetToken=',
    );
  });

  it('resolves silently (no email sent, no error) for an unknown email', async () => {
    const deps = await setup();

    await expect(
      requestPasswordReset(deps, {
        tenantId,
        email: 'nobody@example.com',
        resetUrlBase: 'https://editor.example.com/',
        captchaToken: 'valid-token',
      }),
    ).resolves.toBeUndefined();
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  // Security review 2026-08-24, point 13: without this, a single IP stays
  // under the per-IP rate limit while still mailing hundreds of reset
  // emails per hour to one victim. Checked before the user lookup, so it
  // rejects a known AND an unknown email identically — no enumeration leak.
  it('rejects a missing/invalid CAPTCHA token before even looking up the account', async () => {
    const deps = await setup();

    await expect(
      requestPasswordReset(deps, {
        tenantId,
        email: 'lele@example.com',
        resetUrlBase: 'https://editor.example.com/',
        captchaToken: '',
      }),
    ).rejects.toThrow(InvalidCaptchaError);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });
});

describe('resetPassword', () => {
  it('updates the password and invalidates existing sessions', async () => {
    const deps = await setup();
    const session = await deps.authPort.createSession('user-1', tenantId);
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'password-reset',
      1000 * 60,
    );

    await resetPassword(deps, {
      token: token.token,
      newPassword: 'new-password',
    });

    const user = await deps.userRepository.findById(tenantId, 'user-1');
    expect(
      await deps.authPort.verifyPassword(
        'new-password',
        user?.passwordHash ?? '',
      ),
    ).toBe(true);
    expect(await deps.authPort.validateSession(session.token)).toBeNull();
  });

  it('does not switch back on an account an admin switched off after the token was read', async () => {
    const deps = await setup();
    await deps.userRepository.add(
      User.create({
        id: 'editor-1',
        tenantId,
        email: 'ed@example.com',
        displayName: 'Ed',
        passwordHash: 'x',
        role: 'editor',
      }),
    );
    // Another active admin has to stay for the switch-off to be allowed: user-1.
    const token = await deps.verificationTokenPort.createToken(
      'editor-1',
      tenantId,
      'password-reset',
      1000 * 60,
    );
    deps.userRepository.switchOffAfterTheNextReadOf('editor-1');

    await resetPassword(deps, {
      token: token.token,
      newPassword: 'new-password',
    });

    const stored = await deps.userRepository.findById(tenantId, 'editor-1');
    expect(stored?.isActive).toBe(false);
    expect(
      await deps.authPort.verifyPassword(
        'new-password',
        stored?.passwordHash ?? '',
      ),
    ).toBe(true);
  });

  it('throws InvalidOrExpiredTokenError for an unknown token', async () => {
    const deps = await setup();

    await expect(
      resetPassword(deps, { token: 'not-a-real-token', newPassword: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('throws InvalidOrExpiredTokenError for a token issued for a different purpose', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'email-verification',
      1000 * 60,
    );

    await expect(
      resetPassword(deps, { token: token.token, newPassword: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('throws InvalidOrExpiredTokenError when the token references a user that no longer exists', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-that-was-deleted',
      tenantId,
      'password-reset',
      1000 * 60,
    );

    await expect(
      resetPassword(deps, { token: token.token, newPassword: 'x' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('is single-use: consuming the same token twice fails the second time', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'password-reset',
      1000 * 60,
    );

    await resetPassword(deps, {
      token: token.token,
      newPassword: 'new-password',
    });

    await expect(
      resetPassword(deps, { token: token.token, newPassword: 'other' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });
});
