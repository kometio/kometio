import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The visitor behind the request currently being rendered, available to
 * code that has no `Astro` object in hand.
 *
 * `public-api-client` needs it: the public API rate-limits per IP, and
 * every one of its calls is made by THIS server, so without the visitor's
 * own address the whole site shares a single bucket and a busy minute
 * turns into a 500 for everybody (see PublicPagesThrottlerGuard). Threading
 * the address through ten function signatures — none of which is about
 * addresses — would put it in the wrong place; a request-scoped store is
 * what it is.
 */
export interface PublicRequestContext {
  /** The end visitor's IP, or null when it cannot be determined. */
  visitorIp: string | null;
}

const storage = new AsyncLocalStorage<PublicRequestContext>();

export function runWithRequestContext<T>(
  context: PublicRequestContext,
  run: () => T,
): T {
  return storage.run(context, run);
}

/** Null outside a request — a build-time render, or a test. */
export function currentVisitorIp(): string | null {
  return storage.getStore()?.visitorIp ?? null;
}

/**
 * The visitor's address from a proxy's `X-Forwarded-For`, taking the LAST
 * entry rather than the first.
 *
 * The header is a list, appended to by each hop, and a client may send one
 * to begin with — so the first entry is whatever the client typed and the
 * last is the one the proxy closest to us observed. Astro's own
 * `clientAddress` takes the first, which is the client-controlled end, and
 * it only consults the header at all when `security.allowedDomains` is
 * configured — a build-time list this project deliberately does not have,
 * because one built image serves whichever domains its env points at.
 *
 * Trusting the header is sound only because of how this is deployed:
 * `docker-compose.prod.yml` publishes ports for Caddy alone, so nothing
 * reaches this server except through it.
 */
export function visitorIpFromForwardedFor(
  header: string | null,
): string | null {
  if (!header) return null;
  const hops = header
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.length > 0 ? (hops[hops.length - 1] ?? null) : null;
}
