import { beforeEach, describe, expect, it } from 'vitest';
import {
  IncorrectPasswordError,
  InvalidSecondFactorError,
  NoSecondFactorEnrolmentError,
  SecondFactorAlreadyEnabledError,
  SecondFactorCodeMismatchError,
  SecondFactorNotAvailableError,
  SecondFactorNotEnabledError,
  SecretUnreadableError,
} from '@kometio/domain-core';
import {
  buildUser,
  FakeAuthPort,
  FakeSecretCipher,
  FakeTotp,
  FakeVerificationTokenPort,
  InMemorySecondFactorRepository,
  InMemoryUserRepository,
} from '@kometio/testing';
import { beginSecondFactorEnrolment } from './begin-second-factor-enrolment.use-case';
import { completeSecondFactorLogin } from './complete-second-factor-login.use-case';
import { confirmSecondFactorEnrolment } from './confirm-second-factor-enrolment.use-case';
import { disableSecondFactor } from './disable-second-factor.use-case';
import { regenerateRecoveryCodes } from './regenerate-recovery-codes.use-case';
import { resetSecondFactor } from './reset-second-factor.use-case';
import {
  RECOVERY_CODE_COUNT,
  SECOND_FACTOR_LOCK_MS,
  SECOND_FACTOR_MAX_ATTEMPTS,
  SECOND_FACTOR_MAX_FAILED_ATTEMPTS,
} from './second-factor-policy';

const tenantId = 'tenant-1';
const userId = 'user-1';
const NOW = new Date('2026-10-14T12:00:00Z');

async function setup() {
  const authPort = new FakeAuthPort();
  const userRepository = new InMemoryUserRepository();
  await userRepository.add(
    buildUser({
      id: userId,
      tenantId,
      email: 'anna@example.test',
      passwordHash: await authPort.hashPassword('correct-password'),
      isActive: true,
    }),
  );
  const totpPort = new FakeTotp();
  const secondFactorRepository = new InMemorySecondFactorRepository();
  const secretCipher = new FakeSecretCipher();
  const verificationTokenPort = new FakeVerificationTokenPort();
  return {
    authPort,
    userRepository,
    totpPort,
    secondFactorRepository,
    secretCipher,
    verificationTokenPort,
  };
}

type Deps = Awaited<ReturnType<typeof setup>>;

/** A person who has gone through the whole enrolment; what they were shown comes back. */
async function enrol(deps: Deps) {
  const begun = await beginSecondFactorEnrolment(deps, {
    tenantId,
    userId,
    password: 'correct-password',
    issuer: 'Studio Prova',
  });
  const confirmed = await confirmSecondFactorEnrolment(deps, {
    tenantId,
    userId,
    code: deps.totpPort.codeAt(begun.secret, NOW),
    currentSessionToken: 'this-session',
    now: NOW,
  });
  return { secret: begun.secret, recoveryCodes: confirmed.recoveryCodes };
}

describe('turning the second step on', () => {
  let deps: Deps;
  beforeEach(async () => {
    deps = await setup();
  });

  it('shows a secret and where to scan it, and keeps it sealed and not yet on', async () => {
    const result = await beginSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      issuer: 'Studio Prova',
    });

    expect(result.secret).toBe('SECRET1');
    expect(result.provisioningUri).toBe(
      'otpauth://totp/Studio Prova:anna@example.test?secret=SECRET1',
    );
    const kept = await deps.secondFactorRepository.findTotp(tenantId, userId);
    expect(kept?.confirmedAt).toBeNull();
    expect(kept?.sealedSecret).not.toContain('SECRET1');
    expect(deps.secretCipher.open(kept?.sealedSecret ?? '')).toBe('SECRET1');
  });

  it('asks for the password again before it makes a secret', async () => {
    await expect(
      beginSecondFactorEnrolment(deps, {
        tenantId,
        userId,
        password: 'a-session-left-open',
        issuer: 'Studio Prova',
      }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
    expect(
      await deps.secondFactorRepository.findTotp(tenantId, userId),
    ).toBeNull();
  });

  it('is not offered where nothing can be sealed', async () => {
    await expect(
      beginSecondFactorEnrolment(
        { ...deps, secretCipher: null },
        { tenantId, userId, password: 'correct-password', issuer: 'x' },
      ),
    ).rejects.toBeInstanceOf(SecondFactorNotAvailableError);
  });

  it('is refused when it is already on, rather than replacing a working secret', async () => {
    await enrol(deps);

    await expect(
      beginSecondFactorEnrolment(deps, {
        tenantId,
        userId,
        password: 'correct-password',
        issuer: 'Studio Prova',
      }),
    ).rejects.toBeInstanceOf(SecondFactorAlreadyEnabledError);
  });

  it('starting again replaces the pending secret', async () => {
    await beginSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      issuer: 'Studio Prova',
    });
    const second = await beginSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      issuer: 'Studio Prova',
    });

    const kept = await deps.secondFactorRepository.findTotp(tenantId, userId);
    expect(deps.secretCipher.open(kept?.sealedSecret ?? '')).toBe(
      second.secret,
    );
    expect(second.secret).toBe('SECRET2');
  });

  it('switches on with the first code that fits, and gives ten recovery codes once', async () => {
    const { recoveryCodes } = await enrol(deps);

    expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(
      (await deps.secondFactorRepository.findTotp(tenantId, userId))
        ?.confirmedAt,
    ).toBeInstanceOf(Date);
    // Kept as hashes: what a person was shown is not what is stored.
    expect(
      await deps.secondFactorRepository.spendRecoveryCode(
        tenantId,
        userId,
        recoveryCodes[0] ?? '',
      ),
    ).toBe(false);
    expect(
      await deps.secondFactorRepository.spendRecoveryCode(
        tenantId,
        userId,
        deps.totpPort.hashRecoveryCode(recoveryCodes[0] ?? ''),
      ),
    ).toBe(true);
  });

  it('records the step of the code that confirmed it, so it cannot be given again at once', async () => {
    const { secret } = await enrol(deps);

    const factor = await deps.secondFactorRepository.findTotp(tenantId, userId);
    expect(factor?.lastUsedStep).toBe(Math.floor(NOW.getTime() / 30000));
    expect(secret).toBeTruthy();
  });

  it('refuses a code that does not fit, and stays off', async () => {
    await beginSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      issuer: 'Studio Prova',
    });

    await expect(
      confirmSecondFactorEnrolment(deps, {
        tenantId,
        userId,
        code: '000000',
        currentSessionToken: 'this-session',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(SecondFactorCodeMismatchError);
    expect(
      (await deps.secondFactorRepository.findTotp(tenantId, userId))
        ?.confirmedAt,
    ).toBeNull();
  });

  it('has nothing to confirm without a beginning', async () => {
    await expect(
      confirmSecondFactorEnrolment(deps, {
        tenantId,
        userId,
        code: '123456',
        currentSessionToken: 'this-session',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(NoSecondFactorEnrolmentError);
  });

  it('ends every other session, and keeps the one it was done from', async () => {
    const mine = await deps.authPort.createSession(userId, tenantId);
    const elsewhere = await deps.authPort.createSession(userId, tenantId);
    const begun = await beginSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      issuer: 'Studio Prova',
    });

    await confirmSecondFactorEnrolment(deps, {
      tenantId,
      userId,
      code: deps.totpPort.codeAt(begun.secret, NOW),
      currentSessionToken: mine.token,
      now: NOW,
    });

    expect(await deps.authPort.validateSession(mine.token)).not.toBeNull();
    expect(await deps.authPort.validateSession(elsewhere.token)).toBeNull();
  });
});

describe('the second step of a sign-in', () => {
  let deps: Deps;
  let secret: string;
  let recoveryCodes: string[];

  /** What loginUser does after the password: the challenge a person is given. */
  async function challenge(payload = '0') {
    return (
      await deps.verificationTokenPort.createToken(
        userId,
        tenantId,
        'second-factor',
        5 * 60 * 1000,
        payload,
      )
    ).token;
  }

  beforeEach(async () => {
    deps = await setup();
    ({ secret, recoveryCodes } = await enrol(deps));
  });

  /** A moment after the code that switched it on, in a step of its own. */
  const LATER = new Date(NOW.getTime() + 60_000);

  it('gives a session for the code the app shows now', async () => {
    const result = await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code: deps.totpPort.codeAt(secret, LATER),
      now: LATER,
    });

    expect(result.session.userId).toBe(userId);
    expect(result.usedRecoveryCode).toBe(false);
  });

  it('takes the code with the space an app prints in the middle of it', async () => {
    const code = deps.totpPort.codeAt(secret, LATER);

    const result = await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code: `${code.slice(0, 3)} ${code.slice(3)}`,
      now: LATER,
    });

    expect(result.session.userId).toBe(userId);
  });

  it('is good once: the same code a second time is refused, and so is the one that confirmed the enrolment', async () => {
    const code = deps.totpPort.codeAt(secret, LATER);
    await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code,
      now: LATER,
    });

    await expect(
      completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code,
        now: LATER,
      }),
    ).rejects.toBeInstanceOf(InvalidSecondFactorError);
    await expect(
      completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, NOW),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(InvalidSecondFactorError);
  });

  it('spends a challenge when it reads it: it cannot be answered twice', async () => {
    const token = await challenge();
    await completeSecondFactorLogin(deps, {
      challenge: token,
      code: deps.totpPort.codeAt(secret, LATER),
      now: LATER,
    });

    await expect(
      completeSecondFactorLogin(deps, {
        challenge: token,
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      }),
    ).rejects.toMatchObject({ userId: null, nextChallenge: null });
  });

  it('answers a wrong code with a fresh challenge to try again with', async () => {
    const error = await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code: '000000',
      now: LATER,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidSecondFactorError);
    const again = (error as InvalidSecondFactorError).nextChallenge;
    expect(again).toEqual(expect.any(String));
    // The new one works, and the typo cost nothing but a try.
    const result = await completeSecondFactorLogin(deps, {
      challenge: again ?? '',
      code: deps.totpPort.codeAt(secret, LATER),
      now: LATER,
    });
    expect(result.session.userId).toBe(userId);
  });

  it('gives up after the tries of one challenge, and sends the person back to the password', async () => {
    let token: string | null = await challenge();
    let tries = 0;
    let last: InvalidSecondFactorError | null = null;
    while (token !== null && tries < SECOND_FACTOR_MAX_ATTEMPTS + 2) {
      tries += 1;
      const error: unknown = await completeSecondFactorLogin(deps, {
        challenge: token,
        code: '000000',
        now: LATER,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidSecondFactorError);
      last = error as InvalidSecondFactorError;
      token = last.nextChallenge;
    }

    expect(tries).toBe(SECOND_FACTOR_MAX_ATTEMPTS);
    expect(last?.userId).toBe(userId);
    expect(last?.nextChallenge).toBeNull();
  });

  it('refuses a challenge that was never issued, with no account named', async () => {
    await expect(
      completeSecondFactorLogin(deps, {
        challenge: 'made-up',
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      }),
    ).rejects.toMatchObject({ userId: null, nextChallenge: null });
  });

  it('takes a recovery code, once, and says how many are left', async () => {
    const first = await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code: recoveryCodes[0] ?? '',
      now: LATER,
    });

    expect(first.usedRecoveryCode).toBe(true);
    expect(first.recoveryCodesLeft).toBe(RECOVERY_CODE_COUNT - 1);
    await expect(
      completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: recoveryCodes[0] ?? '',
        now: LATER,
      }),
    ).rejects.toBeInstanceOf(InvalidSecondFactorError);
  });

  it('takes a recovery code however it was written down', async () => {
    const written = (recoveryCodes[1] ?? '').toUpperCase().replace('-', ' ');

    const result = await completeSecondFactorLogin(deps, {
      challenge: await challenge(),
      code: written,
      now: LATER,
    });

    expect(result.usedRecoveryCode).toBe(true);
  });

  describe('too many wrong codes, across challenges', () => {
    /** A password and a captcha later: a challenge of its own, each time. */
    async function wrongCodeWithFreshChallenge(at: Date) {
      return completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: '000000',
        now: at,
      }).catch((e: unknown) => e);
    }

    async function lockTheCodes() {
      for (let i = 0; i < SECOND_FACTOR_MAX_FAILED_ATTEMPTS; i += 1) {
        const error = await wrongCodeWithFreshChallenge(LATER);
        expect(error).toBeInstanceOf(InvalidSecondFactorError);
      }
    }

    it('holds the codes of the app back, and says so, even for the right one', async () => {
      await lockTheCodes();

      const error = await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidSecondFactorError);
      expect(error).toMatchObject({ locked: true });
    });

    it('lets them in again when the lock has run out', async () => {
      await lockTheCodes();
      const later = new Date(LATER.getTime() + SECOND_FACTOR_LOCK_MS + 1000);

      const result = await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, later),
        now: later,
      });

      expect(result.session.userId).toBe(userId);
    });

    it('does not hold a recovery code back, and opens the codes of the app again', async () => {
      await lockTheCodes();

      const viaRecovery = await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: recoveryCodes[3] ?? '',
        now: LATER,
      });
      expect(viaRecovery.usedRecoveryCode).toBe(true);

      const viaApp = await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      });
      expect(viaApp.session.userId).toBe(userId);
    });

    it('forgets the wrong codes when a right one comes', async () => {
      for (let i = 0; i < SECOND_FACTOR_MAX_FAILED_ATTEMPTS - 1; i += 1) {
        await wrongCodeWithFreshChallenge(LATER);
      }
      await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      });

      // The count is back to nothing: the same four wrong ones lock nothing.
      for (let i = 0; i < SECOND_FACTOR_MAX_FAILED_ATTEMPTS - 1; i += 1) {
        await wrongCodeWithFreshChallenge(LATER);
      }
      const next = new Date(LATER.getTime() + 30_000);
      const result = await completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, next),
        now: next,
      });
      expect(result.session.userId).toBe(userId);
    });
  });

  describe('when the key that sealed the secret is gone', () => {
    // The secrets volume was replaced: what is stored cannot be opened.
    function withoutKey(): Deps {
      return {
        ...deps,
        secretCipher: {
          seal: deps.secretCipher.seal.bind(deps.secretCipher),
          open: () => {
            throw new SecretUnreadableError();
          },
        },
      };
    }

    it('lets a recovery code in, which needs no key', async () => {
      await expect(
        completeSecondFactorLogin(withoutKey(), {
          challenge: await challenge(),
          code: recoveryCodes[2] ?? '',
          now: LATER,
        }),
      ).resolves.toMatchObject({ usedRecoveryCode: true });
    });

    it('refuses a code from the app, as a wrong code and not as an error', async () => {
      await expect(
        completeSecondFactorLogin(withoutKey(), {
          challenge: await challenge(),
          code: deps.totpPort.codeAt(secret, LATER),
          now: LATER,
        }),
      ).rejects.toBeInstanceOf(InvalidSecondFactorError);
    });
  });

  it('does not sign in an account that was switched off since the password', async () => {
    // Somebody else stays an administrator: the last one cannot be switched off.
    await deps.userRepository.add(
      buildUser({
        id: 'user-2',
        tenantId,
        email: 'other@example.test',
        role: 'admin',
        isActive: true,
      }),
    );
    const user = await deps.userRepository.findById(tenantId, userId);
    user?.deactivate();
    if (user) await deps.userRepository.saveAccess(user);

    await expect(
      completeSecondFactorLogin(deps, {
        challenge: await challenge(),
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      }),
    ).rejects.toMatchObject({ userId, nextChallenge: null });
  });

  it('does not ask for what an administrator took away since the password', async () => {
    const token = await challenge();
    await resetSecondFactor(deps, { tenantId, targetUserId: userId });

    await expect(
      completeSecondFactorLogin(deps, {
        challenge: token,
        code: deps.totpPort.codeAt(secret, LATER),
        now: LATER,
      }),
    ).rejects.toMatchObject({ userId, nextChallenge: null });
  });
});

describe('turning it off, new codes, and a reset', () => {
  let deps: Deps;
  beforeEach(async () => {
    deps = await setup();
    await enrol(deps);
  });

  it('turns off for a person who gives the password, and ends their other sessions', async () => {
    const mine = await deps.authPort.createSession(userId, tenantId);
    const elsewhere = await deps.authPort.createSession(userId, tenantId);

    await disableSecondFactor(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      currentSessionToken: mine.token,
    });

    expect(
      await deps.secondFactorRepository.findTotp(tenantId, userId),
    ).toBeNull();
    expect(await deps.authPort.validateSession(mine.token)).not.toBeNull();
    expect(await deps.authPort.validateSession(elsewhere.token)).toBeNull();
  });

  it('does not turn off for a wrong password', async () => {
    await expect(
      disableSecondFactor(deps, {
        tenantId,
        userId,
        password: 'guess',
        currentSessionToken: 'x',
      }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
    expect(
      (await deps.secondFactorRepository.findTotp(tenantId, userId))
        ?.confirmedAt,
    ).toBeInstanceOf(Date);
  });

  it('says so when there is nothing to turn off', async () => {
    await disableSecondFactor(deps, {
      tenantId,
      userId,
      password: 'correct-password',
      currentSessionToken: 'x',
    });

    await expect(
      disableSecondFactor(deps, {
        tenantId,
        userId,
        password: 'correct-password',
        currentSessionToken: 'x',
      }),
    ).rejects.toBeInstanceOf(SecondFactorNotEnabledError);
  });

  it('makes new recovery codes, and the old ones stop working', async () => {
    const before = await deps.secondFactorRepository.countUnspentRecoveryCodes(
      tenantId,
      userId,
    );
    expect(before).toBe(RECOVERY_CODE_COUNT);

    const { recoveryCodes } = await regenerateRecoveryCodes(deps, {
      tenantId,
      userId,
      password: 'correct-password',
    });

    expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(
      await deps.secondFactorRepository.spendRecoveryCode(
        tenantId,
        userId,
        deps.totpPort.hashRecoveryCode('rec00001-xxxxx'),
      ),
    ).toBe(false);
    expect(
      await deps.secondFactorRepository.spendRecoveryCode(
        tenantId,
        userId,
        deps.totpPort.hashRecoveryCode(recoveryCodes[0] ?? ''),
      ),
    ).toBe(true);
  });

  it('asks for the password for new codes too', async () => {
    await expect(
      regenerateRecoveryCodes(deps, {
        tenantId,
        userId,
        password: 'guess',
      }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
  });

  it('lets an administrator take it off another person, and ends all their sessions', async () => {
    const theirs = await deps.authPort.createSession(userId, tenantId);

    await resetSecondFactor(deps, { tenantId, targetUserId: userId });

    expect(
      await deps.secondFactorRepository.findTotp(tenantId, userId),
    ).toBeNull();
    expect(await deps.authPort.validateSession(theirs.token)).toBeNull();
  });

  it('says so when the person had none', async () => {
    await expect(
      resetSecondFactor(deps, { tenantId, targetUserId: 'nobody' }),
    ).rejects.toThrow();
    await resetSecondFactor(deps, { tenantId, targetUserId: userId });

    await expect(
      resetSecondFactor(deps, { tenantId, targetUserId: userId }),
    ).rejects.toBeInstanceOf(SecondFactorNotEnabledError);
  });
});
