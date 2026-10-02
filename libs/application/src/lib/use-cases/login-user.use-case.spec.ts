import { describe, expect, it, vi } from 'vitest';
import {
  InvalidCaptchaError,
  InvalidCredentialsError,
  UserNotActiveError,
} from '@kometio/domain-core';
import type { AuthPort, Session, UserRepositoryPort } from '@kometio/ports';
import {
  buildUser,
  FakeAuthPort,
  FakeCaptchaPort,
  InMemoryUserRepository,
} from '@kometio/testing';
import { loginUser } from './login-user.use-case';

const tenantId = 'tenant-1';

describe('loginUser', () => {
  it('creates a session when the account is active and the password matches', async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(buildUser({ isActive: true })),
    } as unknown as UserRepositoryPort;
    const session: Session = {
      token: 'a-token',
      userId: 'user-1',
      tenantId,
      expiresAt: new Date(),
    };
    const authPort = {
      verifyPassword: vi.fn().mockResolvedValue(true),
      createSession: vi.fn().mockResolvedValue(session),
    } as unknown as AuthPort;
    const captchaPort = new FakeCaptchaPort();

    const result = await loginUser(
      { userRepository, authPort, captchaPort },
      {
        tenantId,
        email: 'lele@example.com',
        password: 'correct',
        captchaToken: 'valid-token',
      },
    );

    expect(result).toBe(session);
  });

  it('rejects a deactivated account even with the correct password', async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(buildUser({ isActive: false })),
    } as unknown as UserRepositoryPort;
    const authPort = {
      verifyPassword: vi.fn().mockResolvedValue(true),
      createSession: vi.fn(),
    } as unknown as AuthPort;
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort },
        {
          tenantId,
          email: 'lele@example.com',
          password: 'correct',
          captchaToken: 'valid-token',
        },
      ),
    ).rejects.toThrow(UserNotActiveError);
    expect(authPort.createSession).not.toHaveBeenCalled();
  });

  it('checks the password before isActive, so a wrong password never reveals deactivation status', async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(buildUser({ isActive: false })),
    } as unknown as UserRepositoryPort;
    const authPort = {
      verifyPassword: vi.fn().mockResolvedValue(false),
      createSession: vi.fn(),
    } as unknown as AuthPort;
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort },
        {
          tenantId,
          email: 'lele@example.com',
          password: 'wrong',
          captchaToken: 'valid-token',
        },
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects an unknown email', async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
    } as unknown as UserRepositoryPort;
    const authPort = {
      verifyPassword: vi.fn(),
      createSession: vi.fn(),
    } as unknown as AuthPort;
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort },
        {
          tenantId,
          email: 'nobody@example.com',
          password: 'irrelevant',
          captchaToken: 'valid-token',
        },
      ),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(authPort.verifyPassword).not.toHaveBeenCalled();
  });

  // Security review 2026-08-24, point 13: credential stuffing distributed
  // across many IPs had no second line of defense beyond per-IP rate
  // limiting — this is that second line.
  it('rejects a missing/invalid CAPTCHA token before even looking up the account', async () => {
    const userRepository = {
      findByEmail: vi.fn(),
    } as unknown as UserRepositoryPort;
    const authPort = {
      verifyPassword: vi.fn(),
      createSession: vi.fn(),
    } as unknown as AuthPort;
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort },
        {
          tenantId,
          email: 'lele@example.com',
          password: 'correct',
          captchaToken: '',
        },
      ),
    ).rejects.toThrow(InvalidCaptchaError);
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });
});

describe('loginUser: the address is the same whatever case it is typed in', () => {
  async function setup() {
    const authPort = new FakeAuthPort();
    const userRepository = new InMemoryUserRepository();
    await userRepository.add(
      buildUser({
        email: 'Mario.Rossi@Example.com',
        passwordHash: await authPort.hashPassword('correct'),
        isActive: true,
      }),
    );
    return { userRepository, authPort, captchaPort: new FakeCaptchaPort() };
  }

  it.each(['mario.rossi@example.com', 'MARIO.ROSSI@EXAMPLE.COM'])(
    'signs in as %s, the account invited as Mario.Rossi@Example.com',
    async (typed) => {
      const deps = await setup();

      const session = await loginUser(deps, {
        tenantId: 'tenant-1',
        email: typed,
        password: 'correct',
        captchaToken: 'valid-token',
      });

      expect(session.userId).toBe('user-1');
    },
  );

  it('still refuses a wrong password, whatever the case', async () => {
    const deps = await setup();

    await expect(
      loginUser(deps, {
        tenantId: 'tenant-1',
        email: 'MARIO.ROSSI@EXAMPLE.COM',
        password: 'wrong',
        captchaToken: 'valid-token',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
