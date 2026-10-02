import {
  Inject,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';

/** One count a request adds to: its key, how many it may reach, and over how long. */
export interface ThrottleBucket {
  key: string;
  limit: number;
  ttlMs: number;
}

/** The part of a request a bucket is keyed on. */
export interface ThrottledRequest {
  body?: unknown;
  params?: Record<string, string | undefined>;
  ip?: string;
  /** Who the session belongs to, on a route SessionAuthGuard has already covered. */
  userId?: string;
}

/**
 * Rate limiting on a key of the request's own — an email, a form — rather
 * than on the address alone, which is all `ThrottlerGuard` keys on.
 *
 * It reuses `ThrottlerStorage` (the same in-memory storage `ThrottlerModule`
 * injects) instead of a second named throttler: `ThrottlerGuard` applies
 * one tracker, the address by default, to every named throttler it sees,
 * so a second one would still not key on anything else. Each subclass
 * says what it counts; a request that gives no key counts nothing, and
 * validation downstream refuses it if it has to.
 */
export abstract class KeyedThrottlerGuard implements CanActivate {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  protected abstract buckets(
    request: ThrottledRequest,
    scope: string,
  ): ThrottleBucket[];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ThrottledRequest>();
    const scope = `${context.getClass().name}:${context.getHandler().name}`;
    for (const bucket of this.buckets(request, scope)) {
      const record = await this.storage.increment(
        bucket.key,
        bucket.ttlMs,
        bucket.limit,
        0,
        'keyed',
      );
      if (record.totalHits > bucket.limit) {
        throw new ThrottlerException();
      }
    }
    return true;
  }
}
