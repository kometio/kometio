/**
 * The body a spec's `fetch` was called with, as the text it was sent as.
 * `RequestInit['body']` is also a stream, a form or nothing; a spec that
 * reads it as JSON is relying on it being a string, and this says so.
 */
export function bodyOf(init: RequestInit | undefined): string {
  const body = init?.body;
  if (typeof body === 'string') return body;
  throw new Error(
    `Expected the request to carry a string body, got ${typeof body}`,
  );
}
