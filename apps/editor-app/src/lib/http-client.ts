import { z } from 'zod';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { apiBaseUrl } from './runtime-config';

// Exported for the one case that cannot go through `request()`: a file
// download, where the browser has to do the fetching itself for the save
// dialog to appear (forms-api-client.ts's CSV export).
//
// Read once here, at module load: `/config.js` runs before the bundle, so
// the container's own address is already in place (docs/adr/0076).
export const API_BASE_URL = apiBaseUrl();

// Security review 2026-08-24, point 18: without this, a backend that hangs
// (pool exhausted, a slow query) left the editor tab stuck indefinitely —
// no error, no retry, just a spinner forever. 20s is generous for an admin
// UI (uploads use their own longer budget below), not a snappy-UX target.
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}: ${JSON.stringify(body)}`);
    this.name = 'ApiError';
  }

  /**
   * The server's own sentence, for showing to a person.
   *
   * `message` keeps the status and the raw body, which is what you want
   * in a log and never what you want on screen: rendered with String(),
   * an ordinary refusal reached the reader as
   * `ApiError: API 403: {"message":"...","statusCode":403}`.
   */
  get displayMessage(): string | null {
    if (!this.body || typeof this.body !== 'object') return null;
    const message = 'message' in this.body ? this.body.message : undefined;
    return typeof message === 'string' && message ? message : null;
  }
}

/**
 * What to put in front of a person when an action fails: the server's
 * explanation when it gave one, and the caller's own fallback when it
 * did not (a timeout, the network, a bug).
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.displayMessage ?? fallback;
  return fallback;
}

/**
 * The shape of a 400 the API gives for a body it refused: zod's own
 * `flatten()` (apps/api zod-validation.pipe.ts) — a list of messages for
 * each field that was wrong.
 */
const fieldErrorsBodySchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string())),
});

/** Whether `name` is a field of the form, so a message can be put under it. */
function isFieldOf<Values extends FieldValues>(
  values: Values,
  name: string,
): name is Path<Values> {
  return Object.prototype.hasOwnProperty.call(values, name);
}

/**
 * Puts what the API said was wrong with each field under that field, in
 * the form, instead of one sentence at the top that says only "something
 * went wrong". Returns whether it put at least one there: when it did not
 * (another status, a body of another shape, fields the form does not have)
 * the caller still has to say something, and does what it always did.
 *
 * `aliases` for a form whose field is called something other than the
 * API's: the API's `businessPhone` is the form's `phone`.
 */
export function applyApiFieldErrors<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  values: Values,
  aliases: Partial<Record<string, Path<Values>>> = {},
): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  const parsed = fieldErrorsBodySchema.safeParse(error.body);
  if (!parsed.success) return false;

  let assigned = false;
  for (const [name, messages] of Object.entries(parsed.data.fieldErrors)) {
    const field = aliases[name] ?? (isFieldOf(values, name) ? name : undefined);
    const message = messages[0];
    if (field && message) {
      setError(field, { type: 'server', message });
      assigned = true;
    }
  }
  return assigned;
}

/**
 * The server's answer, not yet trusted: every caller that reads it parses
 * it against a schema (`schema.parse(await request(...))`), so a response
 * that is not what the client expects fails where it arrives instead of
 * being believed. A caller that does not read the answer uses `send`.
 */
export async function request(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  // A FormData body (media upload) must NOT get a manual Content-Type: the
  // browser sets its own, with the multipart boundary baked in — forcing
  // application/json here would send the boundary-delimited body under the
  // wrong content type and the server would fail to parse it. It also gets
  // a longer timeout budget: an upload's own transfer time counts against
  // the same clock as the server's response.
  const isFormData = init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      signal: AbortSignal.timeout(
        isFormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
      ),
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`Request timed out: ${path}`);
    }
    throw error;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) {
    return undefined;
  }
  return res.json();
}

/** A request whose answer nobody reads — a deletion, a confirmation: it only has to succeed. */
export async function send(path: string, init?: RequestInit): Promise<void> {
  await request(path, init);
}
