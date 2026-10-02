import type { INestApplication } from '@nestjs/common';

/**
 * How many reverse proxies stand between a visitor and this API, so
 * `req.ip` is the visitor and not the proxy. Every limit per address —
 * logins, public forms, generation — keys on it: behind Caddy, without
 * this, all visitors were one address, and five attempts locked everyone
 * out of logging in.
 *
 * A count, never `true`: only as many hops as are really ours are
 * trusted, so an `X-Forwarded-For` a visitor writes cannot pick their own
 * address. `0` when the API is reached directly (development).
 *
 * The one place it is set, for main.ts and for the integration app alike —
 * a configuration the tests exercise is the one production runs.
 */
export function trustProxyHops(app: INestApplication, hops: number): void {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}
