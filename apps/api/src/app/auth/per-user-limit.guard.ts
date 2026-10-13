import { Injectable, type Type } from '@nestjs/common';
import {
  KeyedThrottlerGuard,
  type ThrottleBucket,
  type ThrottledRequest,
} from '../keyed-throttler.guard';

/**
 * A limit of its own on what one signed-in person may do through a route:
 * `limit` times in `ttlMs`, counted by who they are and not by the address they
 * come from (docs/adr/0120). The address is what `ThrottlerGuard` keys on, and
 * an account is not tied to one: an invitation sent a hundred times, or a
 * generation a provider bills for, from a hundred addresses, is one person.
 *
 * The limit is its `name`: two limits on one route (a minute's and a day's)
 * are counted apart, and two routes that name the same limit share it, so
 * that inviting and re-sending an invitation spend one hour's twenty, not
 * twenty each. It must run after SessionAuthGuard, which puts the person on
 * the request; on a route without one it counts nothing.
 */
export function perUserLimit(
  name: string,
  limit: number,
  ttlMs: number,
): Type<KeyedThrottlerGuard> {
  @Injectable()
  class PerUserLimitGuard extends KeyedThrottlerGuard {
    protected buckets(request: ThrottledRequest): ThrottleBucket[] {
      if (!request.userId) return [];
      return [{ key: `limit:${name}:${request.userId}`, limit, ttlMs }];
    }
  }
  return PerUserLimitGuard;
}

const HOUR = 60 * 60 * 1000;

/** Invitations: an administrator invites a team, not a crowd. */
export const InvitationsPerHour = perUserLimit('invitations', 20, HOUR);

/**
 * Generated pages, per person per day. Each one is the site owner's money with
 * the provider, and the per-address limit of the route does not bound a person
 * who has more than one address.
 */
export const GenerationsPerDay = perUserLimit('generations', 50, 24 * HOUR);
