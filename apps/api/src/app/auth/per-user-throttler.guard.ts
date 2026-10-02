import { Injectable } from '@nestjs/common';
import {
  KeyedThrottlerGuard,
  type ThrottleBucket,
  type ThrottledRequest,
} from '../keyed-throttler.guard';

const TTL_MS = 15 * 60 * 1000;

/**
 * Per signed-in person, for a route that asks for the account's password
 * again. Whoever holds a session that is not theirs (a computer left
 * open, a stolen cookie) can otherwise try passwords here at the speed of
 * the network, from any number of addresses. It must run after
 * SessionAuthGuard, which is what puts the person on the request; on a
 * route without one it counts nothing.
 */
@Injectable()
export class PerUserThrottlerGuard extends KeyedThrottlerGuard {
  protected buckets(
    request: ThrottledRequest,
    scope: string,
  ): ThrottleBucket[] {
    if (!request.userId) return [];
    return [
      { key: `per-user:${scope}:${request.userId}`, limit: 5, ttlMs: TTL_MS },
    ];
  }
}
