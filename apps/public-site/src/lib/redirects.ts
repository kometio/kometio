import type { PublicRedirectAnswer } from '@kometio/api-contracts';

/**
 * Addresses the site answers itself, and whose "not found" is not a page a
 * visitor was looking for: assets, the API's mirror, the image endpoint and
 * the editor's live preview. A rule is never asked about them.
 */
const NOT_ASKED = ['/_astro/', '/_image', '/api/', '/preview/'];

export function isAskedForRedirect(method: string, pathname: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return !NOT_ASKED.some((prefix) => pathname.startsWith(prefix));
}

/** What a link carries to say where it was shared, and nothing else: a campaign's, not a rule's. */
const TRACKING_PARAM =
  /^(utm_[a-z0-9_]+|fbclid|gclid|msclkid|mc_[a-z]+|_ga|_gl)$/i;

/**
 * Whether the front door's query is only that. `/?utm_source=mail` is the
 * front door; `/?p=123` is a question, which a migrated site is asked a lot,
 * and is the only front door worth a call to the API.
 */
export function hasOnlyTrackingParams(search: string): boolean {
  const keys = [...new URLSearchParams(search).keys()];
  return keys.every((key) => TRACKING_PARAM.test(key));
}

/** 301 is kept for minutes and not for ever: a rule that was wrong is mended by the time a visitor comes back. */
const PERMANENT_CACHE = 'public, max-age=300';

/** The response for an answer. `notFound` is the page that would have been sent: a gone keeps its body. */
export function responseForRedirect(
  answer: PublicRedirectAnswer,
  notFound?: Response,
): Response {
  if (answer.outcome === 'gone') {
    const headers = new Headers(notFound?.headers);
    headers.set('Cache-Control', PERMANENT_CACHE);
    return new Response(notFound?.body ?? 'Gone', {
      status: 410,
      headers,
    });
  }
  return new Response(null, {
    status: answer.status,
    headers: {
      Location: answer.location,
      'Cache-Control': answer.status === 301 ? PERMANENT_CACHE : 'no-cache',
    },
  });
}

export interface MissingAddressDeps {
  /** The API's answer for an address: `null` for no rule. */
  ask(
    domain: string,
    pathname: string,
    search: string,
  ): Promise<PublicRedirectAnswer | null>;
  /** Told of a lookup that failed. */
  report(error: unknown): void;
}

/**
 * The answer a missing address gets, or `null` to go on with the page that
 * would have been sent. Never throws: a lookup that fails is a 404 that is
 * as it was, and is reported.
 */
export async function redirectForMissing(
  url: URL,
  deps: MissingAddressDeps,
): Promise<PublicRedirectAnswer | null> {
  try {
    return await deps.ask(url.hostname, url.pathname, url.search);
  } catch (error) {
    deps.report(error);
    return null;
  }
}
