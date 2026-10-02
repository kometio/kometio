import { Injectable } from '@nestjs/common';
import {
  KeyedThrottlerGuard,
  type ThrottleBucket,
  type ThrottledRequest,
} from '../keyed-throttler.guard';

const TTL_MS = 15 * 60 * 1000;

/**
 * Security review 2026-08-24, point 13: with the per-IP limit alone, an
 * attacker from a single IP can stay under the threshold (5/min) and still
 * send up to 300 reset emails an hour to the same victim; from several
 * IPs, unlimited. These guards count per EMAIL, however many addresses
 * send the requests.
 */
function emailOf(request: ThrottledRequest): string | null {
  const body = request.body;
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return null;
  }
  return typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : null;
}

/**
 * Per email alone: what a password reset protects is the victim's inbox,
 * which fills the same whoever asks and from wherever.
 */
@Injectable()
export class PerAccountThrottlerGuard extends KeyedThrottlerGuard {
  protected buckets(
    request: ThrottledRequest,
    scope: string,
  ): ThrottleBucket[] {
    const email = emailOf(request);
    if (!email) return [];
    return [{ key: `per-account:${scope}:${email}`, limit: 5, ttlMs: TTL_MS }];
  }
}

/**
 * Login counts per email AND address first: counted per email alone, five
 * wrong passwords from anywhere locked the account's owner out for a
 * quarter of an hour, so knowing an admin's email was enough to keep them
 * out (audit B6, 2026-09-29). From their own address they now still get
 * in. A looser count per email stays behind it, so spreading guesses over
 * many addresses buys six times as many, not unlimited.
 */
@Injectable()
export class LoginThrottlerGuard extends KeyedThrottlerGuard {
  protected buckets(
    request: ThrottledRequest,
    scope: string,
  ): ThrottleBucket[] {
    const email = emailOf(request);
    if (!email) return [];
    const address = request.ip ?? 'unknown';
    return [
      {
        key: `per-account-address:${scope}:${email}:${address}`,
        limit: 5,
        ttlMs: TTL_MS,
      },
      { key: `per-account:${scope}:${email}`, limit: 30, ttlMs: TTL_MS },
    ];
  }
}
