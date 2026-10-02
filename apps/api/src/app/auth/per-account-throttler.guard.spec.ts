import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerException } from '@nestjs/throttler';
import {
  LoginThrottlerGuard,
  PerAccountThrottlerGuard,
} from './per-account-throttler.guard';

/** Same increment/limit semantics as the real in-memory storage this guard is built on — `totalHits` accumulates per key, `isBlocked` is unused by this guard (it reads `totalHits` directly instead). */
class FakeThrottlerStorage implements ThrottlerStorage {
  private hits = new Map<string, number>();

  async increment(key: string) {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return {
      totalHits,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}

function buildContext(
  body: Record<string, unknown>,
  handlerName = 'login',
  ip = '198.51.100.1',
) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, ip }) }),
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: 'AuthController' }),
  } as unknown as ExecutionContext;
}

describe('PerAccountThrottlerGuard', () => {
  it('allows requests up to the limit for one account', async () => {
    const guard = new PerAccountThrottlerGuard(new FakeThrottlerStorage());
    const context = buildContext({ email: 'lele@example.com' });

    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  });

  it('rejects the 6th attempt within the window for the same account', async () => {
    const guard = new PerAccountThrottlerGuard(new FakeThrottlerStorage());
    const context = buildContext({ email: 'victim@example.com' });

    for (let i = 0; i < 5; i++) {
      await guard.canActivate(context);
    }

    await expect(guard.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
  });

  // The exact scenario from the security review: an attacker spread across
  // many IPs (never seen by this guard, which never looks at the IP) stays
  // blocked once they've hit this account specifically 5 times.
  it('tracks independently per email — a different account is unaffected', async () => {
    const storage = new FakeThrottlerStorage();
    const guard = new PerAccountThrottlerGuard(storage);
    const victimContext = buildContext({ email: 'victim@example.com' });
    const otherContext = buildContext({ email: 'someone-else@example.com' });

    for (let i = 0; i < 5; i++) {
      await guard.canActivate(victimContext);
    }
    await expect(guard.canActivate(victimContext)).rejects.toThrow(
      ThrottlerException,
    );

    await expect(guard.canActivate(otherContext)).resolves.toBe(true);
  });

  it('tracks independently per route — hitting the limit on login does not affect request-password-reset', async () => {
    const storage = new FakeThrottlerStorage();
    const guard = new PerAccountThrottlerGuard(storage);
    const loginContext = buildContext({ email: 'lele@example.com' }, 'login');
    const resetContext = buildContext(
      { email: 'lele@example.com' },
      'requestPasswordReset',
    );

    for (let i = 0; i < 5; i++) {
      await guard.canActivate(loginContext);
    }
    await expect(guard.canActivate(loginContext)).rejects.toThrow(
      ThrottlerException,
    );

    await expect(guard.canActivate(resetContext)).resolves.toBe(true);
  });

  it('does not count or block a request with no email in the body — nothing to track', async () => {
    const guard = new PerAccountThrottlerGuard(new FakeThrottlerStorage());
    const context = buildContext({});

    for (let i = 0; i < 20; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
  });

  it('treats the email case-insensitively — Lele@Example.com and lele@example.com share the same bucket', async () => {
    const storage = new FakeThrottlerStorage();
    const guard = new PerAccountThrottlerGuard(storage);

    for (let i = 0; i < 3; i++) {
      await guard.canActivate(buildContext({ email: 'Lele@Example.com' }));
    }
    for (let i = 0; i < 2; i++) {
      await guard.canActivate(buildContext({ email: 'lele@example.com' }));
    }

    await expect(
      guard.canActivate(buildContext({ email: 'LELE@EXAMPLE.COM' })),
    ).rejects.toThrow(ThrottlerException);
  });
});

/*
 * Counted per email alone, five wrong passwords from anywhere kept an
 * account's owner out for a quarter of an hour: knowing an admin's email
 * was enough to lock them out (audit B6).
 */
describe('LoginThrottlerGuard', () => {
  const email = { email: 'admin@esempio.it' };

  it('keeps letting the owner in from their own address while someone else guesses from theirs', async () => {
    const guard = new LoginThrottlerGuard(new FakeThrottlerStorage());
    const attacker = buildContext(email, 'login', '203.0.113.9');
    for (let i = 0; i < 5; i++) await guard.canActivate(attacker);

    await expect(guard.canActivate(attacker)).rejects.toThrow(
      ThrottlerException,
    );
    await expect(
      guard.canActivate(buildContext(email, 'login', '198.51.100.7')),
    ).resolves.toBe(true);
  });

  it('still stops guesses spread over many addresses, past a looser limit', async () => {
    const guard = new LoginThrottlerGuard(new FakeThrottlerStorage());
    for (let i = 0; i < 30; i++) {
      await guard.canActivate(buildContext(email, 'login', `203.0.113.${i}`));
    }

    await expect(
      guard.canActivate(buildContext(email, 'login', '203.0.113.200')),
    ).rejects.toThrow(ThrottlerException);
  });
});
