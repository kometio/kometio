import { describe, expect, it } from 'vitest';
import { InvalidOrExpiredTokenError, User } from '@kometio/domain-core';
import { requestEmailVerification } from './request-email-verification.use-case';
import { verifyEmail } from './verify-email.use-case';
import { InMemoryUserRepository } from '@kometio/testing';
import { FakeVerificationTokenPort } from '@kometio/testing';
import { FakeEmailPort } from '@kometio/testing';
import { FakeDeploymentLocale } from '@kometio/testing';

const tenantId = 'tenant-1';

async function setup(overrides: { verified?: boolean } = {}) {
  const userRepository = new InMemoryUserRepository();
  const verificationTokenPort = new FakeVerificationTokenPort();
  const emailPort = new FakeEmailPort();
  const user = User.create({
    id: 'user-1',
    tenantId,
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: 'irrelevant',
    role: 'admin',
  });
  if (overrides.verified) {
    user.verifyEmail();
  }
  await userRepository.add(user);
  return {
    userRepository,
    verificationTokenPort,
    emailPort,
    deploymentLocale: new FakeDeploymentLocale(),
    user,
  };
}

describe('requestEmailVerification', () => {
  it('sends a verification email with a working link for an unverified user', async () => {
    const deps = await setup();

    await requestEmailVerification(deps, {
      tenantId,
      userId: 'user-1',
      verifyUrlBase: 'https://editor.example.com/',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('lele@example.com');
    expect(deps.emailPort.sentEmails[0].html).toContain(
      'https://editor.example.com/verify-email?verifyToken=',
    );
  });

  it('does nothing when the email is already verified', async () => {
    const deps = await setup({ verified: true });

    await requestEmailVerification(deps, {
      tenantId,
      userId: 'user-1',
      verifyUrlBase: 'https://editor.example.com/',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('does nothing when the user cannot be found', async () => {
    const deps = await setup();

    await requestEmailVerification(deps, {
      tenantId,
      userId: 'does-not-exist',
      verifyUrlBase: 'https://editor.example.com/',
    });

    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });
});

describe('verifyEmail', () => {
  it('marks the user as verified when the token is valid', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'email-verification',
      1000 * 60,
    );

    await verifyEmail(deps, { token: token.token });

    const user = await deps.userRepository.findById(tenantId, 'user-1');
    expect(user?.isEmailVerified).toBe(true);
  });

  it('does not switch back on an account an admin switched off after the token was read', async () => {
    const deps = await setup();
    await deps.userRepository.add(
      User.create({
        id: 'editor-1',
        tenantId,
        email: 'ed@example.com',
        displayName: 'Ed',
        passwordHash: 'irrelevant',
        role: 'editor',
      }),
    );
    // Another active admin has to stay for the switch-off to be allowed: user-1.
    const token = await deps.verificationTokenPort.createToken(
      'editor-1',
      tenantId,
      'email-verification',
      1000 * 60,
    );
    deps.userRepository.switchOffAfterTheNextReadOf('editor-1');

    await verifyEmail(deps, { token: token.token });

    const stored = await deps.userRepository.findById(tenantId, 'editor-1');
    expect(stored?.isActive).toBe(false);
    expect(stored?.isEmailVerified).toBe(true);
  });

  it('throws InvalidOrExpiredTokenError for an unknown token', async () => {
    const deps = await setup();

    await expect(
      verifyEmail(deps, { token: 'not-a-real-token' }),
    ).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('throws InvalidOrExpiredTokenError for a token issued for a different purpose', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'password-reset',
      1000 * 60,
    );

    await expect(verifyEmail(deps, { token: token.token })).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it('throws InvalidOrExpiredTokenError when the token references a user that no longer exists', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-that-was-deleted',
      tenantId,
      'email-verification',
      1000 * 60,
    );

    await expect(verifyEmail(deps, { token: token.token })).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it('is single-use: consuming the same token twice fails the second time', async () => {
    const deps = await setup();
    const token = await deps.verificationTokenPort.createToken(
      'user-1',
      tenantId,
      'email-verification',
      1000 * 60,
    );

    await verifyEmail(deps, { token: token.token });

    await expect(verifyEmail(deps, { token: token.token })).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });
});
