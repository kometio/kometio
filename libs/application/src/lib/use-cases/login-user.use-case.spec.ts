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
  FakeVerificationTokenPort,
  InMemorySecondFactorRepository,
  InMemoryUserRepository,
} from '@kometio/testing';
import { loginUser, type LoginOutcome } from './login-user.use-case';

const tenantId = 'tenant-1';

/** Nobody in these has the second step on: the sign-in is the password. */
function noSecondStep() {
  return {
    secondFactorRepository: new InMemorySecondFactorRepository(),
    verificationTokenPort: new FakeVerificationTokenPort(),
  };
}

function signedIn(outcome: LoginOutcome): Session {
  if (outcome.status !== 'signed-in') {
    throw new Error('The sign-in asked for a second step');
  }
  return outcome.session;
}

describe('loginUser', () => {
  it('creates a session when the account is active and the password matches', async () => {
    const userRepository = {
      findByEmail: vi
        .fn<UserRepositoryPort['findByEmail']>()
        .mockResolvedValue(buildUser({ isActive: true })),
    };
    const session: Session = {
      token: 'a-token',
      userId: 'user-1',
      tenantId,
      expiresAt: new Date(),
    };
    const authPort = {
      verifyPassword: vi
        .fn<AuthPort['verifyPassword']>()
        .mockResolvedValue(true),
      createSession: vi
        .fn<AuthPort['createSession']>()
        .mockResolvedValue(session),
    };
    const captchaPort = new FakeCaptchaPort();

    const result = await loginUser(
      { userRepository, authPort, captchaPort, ...noSecondStep() },
      {
        tenantId,
        email: 'lele@example.com',
        password: 'correct',
        captchaToken: 'valid-token',
      },
    );

    expect(result).toEqual({ status: 'signed-in', session });
  });

  it('rejects a deactivated account even with the correct password', async () => {
    const userRepository = {
      findByEmail: vi
        .fn<UserRepositoryPort['findByEmail']>()
        .mockResolvedValue(buildUser({ isActive: false })),
    };
    const authPort = {
      verifyPassword: vi
        .fn<AuthPort['verifyPassword']>()
        .mockResolvedValue(true),
      createSession: vi.fn<AuthPort['createSession']>(),
    };
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort, ...noSecondStep() },
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
      findByEmail: vi
        .fn<UserRepositoryPort['findByEmail']>()
        .mockResolvedValue(buildUser({ isActive: false })),
    };
    const authPort = {
      verifyPassword: vi
        .fn<AuthPort['verifyPassword']>()
        .mockResolvedValue(false),
      createSession: vi.fn<AuthPort['createSession']>(),
    };
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort, ...noSecondStep() },
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
      findByEmail: vi
        .fn<UserRepositoryPort['findByEmail']>()
        .mockResolvedValue(null),
    };
    const authPort = {
      verifyPassword: vi.fn<AuthPort['verifyPassword']>(),
      createSession: vi.fn<AuthPort['createSession']>(),
    };
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort, ...noSecondStep() },
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
      findByEmail: vi.fn<UserRepositoryPort['findByEmail']>(),
    };
    const authPort = {
      verifyPassword: vi.fn<AuthPort['verifyPassword']>(),
      createSession: vi.fn<AuthPort['createSession']>(),
    };
    const captchaPort = new FakeCaptchaPort();

    await expect(
      loginUser(
        { userRepository, authPort, captchaPort, ...noSecondStep() },
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

describe('loginUser: the device', () => {
  it('keeps a label for the device the sign-in came from, and not the header it was read from', async () => {
    const authPort = new FakeAuthPort();
    const userRepository = new InMemoryUserRepository();
    await userRepository.add(
      buildUser({
        passwordHash: await authPort.hashPassword('correct'),
        isActive: true,
      }),
    );

    const outcome = await loginUser(
      {
        userRepository,
        authPort,
        captchaPort: new FakeCaptchaPort(),
        ...noSecondStep(),
      },
      {
        tenantId,
        email: 'lele@example.com',
        password: 'correct',
        captchaToken: 'valid-token',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      },
    );

    const session = signedIn(outcome);
    const [listed] = await authPort.listSessionsForUser(
      session.userId,
      tenantId,
      session.token,
    );
    expect(listed.deviceLabel).toBe('Chrome on macOS');
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
    return {
      userRepository,
      authPort,
      captchaPort: new FakeCaptchaPort(),
      ...noSecondStep(),
    };
  }

  it.each(['mario.rossi@example.com', 'MARIO.ROSSI@EXAMPLE.COM'])(
    'signs in as %s, the account invited as Mario.Rossi@Example.com',
    async (typed) => {
      const deps = await setup();

      const outcome = await loginUser(deps, {
        tenantId: 'tenant-1',
        email: typed,
        password: 'correct',
        captchaToken: 'valid-token',
      });

      expect(signedIn(outcome).userId).toBe('user-1');
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

describe('loginUser: the second step', () => {
  async function setup(options: { secondStep: boolean }) {
    const authPort = new FakeAuthPort();
    const userRepository = new InMemoryUserRepository();
    const secondFactorRepository = new InMemorySecondFactorRepository();
    const verificationTokenPort = new FakeVerificationTokenPort();
    await userRepository.add(
      buildUser({
        passwordHash: await authPort.hashPassword('correct'),
        isActive: true,
      }),
    );
    if (options.secondStep) {
      await secondFactorRepository.savePendingTotp(
        tenantId,
        'user-1',
        'sealed',
      );
      await secondFactorRepository.confirmTotp(tenantId, 'user-1', 1, []);
    }
    return {
      authPort,
      userRepository,
      secondFactorRepository,
      verificationTokenPort,
      captchaPort: new FakeCaptchaPort(),
    };
  }

  const credentials = {
    tenantId,
    email: 'lele@example.com',
    password: 'correct',
    captchaToken: 'valid-token',
  };

  it('asks for a code instead of giving a session, for a person who turned it on', async () => {
    const deps = await setup({ secondStep: true });
    const createSession = vi.spyOn(deps.authPort, 'createSession');

    const outcome = await loginUser(deps, credentials);

    expect(outcome.status).toBe('second-factor-required');
    expect(createSession).not.toHaveBeenCalled();
    if (outcome.status !== 'second-factor-required') return;
    // The challenge is the token that says who is being asked, and for what.
    const token = await deps.verificationTokenPort.consumeToken(
      outcome.challenge,
      'second-factor',
    );
    expect(token).toMatchObject({ userId: 'user-1', tenantId, payload: '0' });
  });

  it('signs in at once a person who did not', async () => {
    const deps = await setup({ secondStep: false });

    const outcome = await loginUser(deps, credentials);

    expect(outcome.status).toBe('signed-in');
  });

  it('does not ask a person whose enrolment was begun and not finished', async () => {
    const deps = await setup({ secondStep: false });
    await deps.secondFactorRepository.savePendingTotp(
      tenantId,
      'user-1',
      'sealed',
    );

    const outcome = await loginUser(deps, credentials);

    expect(outcome.status).toBe('signed-in');
  });

  it('says nothing about the second step to somebody with the wrong password', async () => {
    const deps = await setup({ secondStep: true });

    await expect(
      loginUser(deps, { ...credentials, password: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
