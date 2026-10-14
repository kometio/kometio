import { ApiError, ServerUnreachableError } from './http-client';

/**
 * Whether a failed query is asked again.
 *
 * A 4xx is an answer: "you are not logged in" (401) or "this name is
 * already taken" (409) is not a network hiccup, and asking again only
 * resends the same bad request. Every guarded route loader is also waiting
 * on a 401 to reject before it can redirect to /login (routes/-require-auth.ts),
 * so retrying it would only delay that redirect.
 *
 * A server that did not answer gets one more try, not three: a blip is
 * worth it, but the usual cause of a screen that never loads is an
 * address the browser is not allowed to ask, and three retries with their
 * backoff were seven seconds of nothing before the person was told.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  if (error instanceof ServerUnreachableError) {
    return failureCount < 1;
  }
  return failureCount < 3;
}
