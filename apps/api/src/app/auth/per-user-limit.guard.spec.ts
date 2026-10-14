import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerException } from '@nestjs/throttler';
import { executionContextOf } from '../../test/http-doubles.test-fixture';
import {
  GenerationsPerDay,
  InvitationsPerHour,
  perUserLimit,
} from './per-user-limit.guard';

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

function contextOf(
  userId: string | undefined,
  ip = '198.51.100.1',
  handler = 'invite',
) {
  return executionContextOf({
    request: { userId, ip },
    handler,
    controller: 'UsersController',
  });
}

describe('perUserLimit', () => {
  const Three = perUserLimit('three', 3, 60_000);

  it('lets a person reach the limit and refuses the next', async () => {
    const guard = new Three(new FakeThrottlerStorage());
    const context = contextOf('user-1');

    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    await expect(guard.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
  });

  it('counts a person across addresses: that is the point of it', async () => {
    const guard = new Three(new FakeThrottlerStorage());

    await guard.canActivate(contextOf('user-1', '203.0.113.1'));
    await guard.canActivate(contextOf('user-1', '203.0.113.2'));
    await guard.canActivate(contextOf('user-1', '203.0.113.3'));

    await expect(
      guard.canActivate(contextOf('user-1', '203.0.113.4')),
    ).rejects.toThrow(ThrottlerException);
  });

  it('keeps one person’s count from another’s', async () => {
    const guard = new Three(new FakeThrottlerStorage());
    for (let i = 0; i < 3; i++) await guard.canActivate(contextOf('user-1'));

    await expect(guard.canActivate(contextOf('user-2'))).resolves.toBe(true);
  });

  it('counts nothing on a request with no signed-in person, which a session guard refuses before', async () => {
    const guard = new Three(new FakeThrottlerStorage());

    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(contextOf(undefined))).resolves.toBe(true);
    }
  });

  it('counts two limits on one route apart, by their names', async () => {
    const storage = new FakeThrottlerStorage();
    const Minute = perUserLimit('minute', 1, 60_000);
    const Day = perUserLimit('day', 5, 86_400_000);
    const minute = new Minute(storage);
    const day = new Day(storage);
    const context = contextOf('user-1');

    await minute.canActivate(context);
    await expect(minute.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
    await expect(day.canActivate(context)).resolves.toBe(true);
  });

  it('is shared by the routes that name it: inviting and resending spend the same hour', async () => {
    const guard = new Three(new FakeThrottlerStorage());
    for (let i = 0; i < 3; i++) await guard.canActivate(contextOf('user-1'));

    await expect(
      guard.canActivate(contextOf('user-1', undefined, 'resendInvite')),
    ).rejects.toThrow(ThrottlerException);
  });
});

describe('the limits the API sets', () => {
  it('lets an administrator invite twenty people an hour, and the twenty-first is refused', async () => {
    const guard = new InvitationsPerHour(new FakeThrottlerStorage());
    const context = contextOf('admin-1');

    for (let i = 0; i < 20; i++) await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
  });

  it('lets a person generate fifty pages a day, and the fifty-first is refused', async () => {
    const guard = new GenerationsPerDay(new FakeThrottlerStorage());
    const context = contextOf('user-1', undefined, 'generate');

    for (let i = 0; i < 50; i++) await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
  });
});
