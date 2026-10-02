import { describe, expect, it } from 'vitest';
import { InvalidCredentialsError, User } from '@kometio/domain-core';
import { loginUser } from './login-user.use-case';
import { logoutUser } from './logout-user.use-case';
import { InMemoryUserRepository } from '@kometio/testing';
import { FakeAuthPort } from '@kometio/testing';
import { FakeCaptchaPort } from '@kometio/testing';

const tenantId = 'tenant-1';

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const authPort = new FakeAuthPort();
  const captchaPort = new FakeCaptchaPort();
  const passwordHash = await authPort.hashPassword('correct-horse-battery');
  const user = User.create({
    id: 'user-1',
    tenantId,
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash,
    role: 'admin',
  });
  await userRepository.add(user);
  return { userRepository, authPort, captchaPort, user };
}

describe('loginUser', () => {
  it('creates a session for correct credentials', async () => {
    const deps = await setup();

    const session = await loginUser(deps, {
      tenantId,
      email: 'lele@example.com',
      password: 'correct-horse-battery',
      captchaToken: 'valid-token',
    });

    expect(session.userId).toBe('user-1');
    expect(session.tenantId).toBe(tenantId);
  });

  it('throws InvalidCredentialsError for an unknown email', async () => {
    const deps = await setup();

    await expect(
      loginUser(deps, {
        tenantId,
        email: 'nobody@example.com',
        password: 'irrelevant',
        captchaToken: 'valid-token',
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for the wrong password', async () => {
    const deps = await setup();

    await expect(
      loginUser(deps, {
        tenantId,
        email: 'lele@example.com',
        password: 'wrong-password',
        captchaToken: 'valid-token',
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});

describe('logoutUser', () => {
  it('invalidates the session so it no longer validates', async () => {
    const deps = await setup();
    const session = await loginUser(deps, {
      tenantId,
      email: 'lele@example.com',
      password: 'correct-horse-battery',
      captchaToken: 'valid-token',
    });

    await logoutUser(deps, { token: session.token });

    expect(await deps.authPort.validateSession(session.token)).toBeNull();
  });
});
