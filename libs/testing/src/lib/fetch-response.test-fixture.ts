/**
 * What a spec hands `fetch` to answer with. These are real `Response`s, so
 * `ok`, `status` and `headers` are what the platform derives from the status:
 * the code under test cannot be satisfied by a hand-written object that says
 * `ok: true` next to `status: 500`, and a spec cannot be wrong about what
 * `ok` means for a 204.
 *
 * The body may be read more than once, unlike a real one. A spec that does
 * `mockResolvedValue(jsonResponse(x))` gives the same object to every call.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return Object.assign(
    new Response(text, {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    { json: () => Promise.resolve(body), text: () => Promise.resolve(text) },
  );
}

/** An answer with no body at all: a 204, by default. */
export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}
