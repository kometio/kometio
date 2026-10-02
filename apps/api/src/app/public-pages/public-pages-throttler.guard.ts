import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from '@kometio/api-contracts';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';

/**
 * Rate-limits the person browsing, not the server rendering for them.
 *
 * Every public page view reaches this API through `apps/public-site`,
 * server side (`API_URL` is `http://api:3000/api`, container to
 * container — it does not go back out through Caddy). To the default
 * throttler, which keys on the connecting address, that is ONE client:
 * the whole site's traffic shared a single 120/min bucket, so a link
 * doing well or a search engine indexing meant a 500 for every visitor
 * at once — and it was never able to tell an abusive visitor from a
 * popular afternoon, which is the job it was written for.
 *
 * The public site now says whose page view this is. That claim is
 * believed only when the caller proves it is the public site: this API
 * answers on a public hostname (`api.{DOMAIN}` in the Caddyfile), so a
 * header anyone can set would be a rate limit anyone can escape by
 * inventing a fresh address per request.
 *
 * With `PUBLIC_API_SERVICE_TOKEN` unset, nothing is trusted and this
 * behaves exactly as the default guard does — an existing deployment
 * upgrades without touching its env and loses nothing it had.
 */
@Injectable()
export class PublicPagesThrottlerGuard extends ThrottlerGuard {
  private readonly vouchedVisitor: ReturnType<typeof vouchedVisitorOf>;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    super(options, storageService, reflector);
    this.vouchedVisitor = vouchedVisitorOf(env.PUBLIC_API_SERVICE_TOKEN);
  }

  protected override async getTracker(req: Request): Promise<string> {
    return this.vouchedVisitor(req) ?? super.getTracker(req);
  }
}

/**
 * The visitor a request speaks for, when this deployment's own public
 * site vouches for them with `serviceToken` — or `null`, and the caller
 * is counted by its own address. With no token configured, nobody is
 * believed.
 */
export function vouchedVisitorOf(
  serviceToken: string | undefined,
): (req: Pick<Request, 'headers'>) => string | null {
  return (req) => {
    if (!serviceToken) return null;
    const visitorIp = headerValue(req, PUBLIC_API_VISITOR_IP_HEADER);
    const presented = headerValue(req, PUBLIC_API_SERVICE_TOKEN_HEADER);
    if (!visitorIp || !presented) return null;
    // Hashed to a fixed width first: timingSafeEqual throws on a length
    // mismatch, and that throw is itself an oracle for the token's length.
    return timingSafeEqual(sha256(presented), sha256(serviceToken))
      ? visitorIp
      : null;
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** A repeated header arrives as an array; a caller does not get to pick which one is read. */
function headerValue(
  req: Pick<Request, 'headers'>,
  name: string,
): string | null {
  const raw = req.headers[name];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
