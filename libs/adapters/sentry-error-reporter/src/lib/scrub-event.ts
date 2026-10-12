import type { ErrorEvent, StackFrame } from '@sentry/node-core/light';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** What follows the `?` of an address in a message: a token, an id, a person's search. */
const QUERY = /(https?:\/\/[^\s?#"')]+)\?[^\s#"')]*/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
/**
 * The values a failed query was run with. Drizzle writes them after the SQL
 * (`Failed query: insert into … values ($1, $2)\nparams: <values>`), and they
 * are a person's email, a password hash, a token.
 */
const QUERY_PARAMS = /(\bparams:)[^\n]*/g;

/**
 * What an error's own words may carry out with them: the text of an error
 * is whatever the code that threw it put there, and a failed query or a
 * failed fetch names its values.
 */
export function redact(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(QUERY, '$1?[query]')
    .replace(BEARER, 'Bearer [token]')
    .replace(QUERY_PARAMS, '$1 [values]');
}

function withoutVars(frame: StackFrame): StackFrame {
  const copy = { ...frame };
  delete copy.vars;
  return copy;
}

/**
 * The least an event may carry out: the error, where in the code it was,
 * and the tags the reporter put on it.
 *
 * Removed whatever the SDK attached about the request (headers and cookies
 * carry the session, the body carries what somebody typed), the person, the
 * machine, and anything free-form (`extra`, breadcrumbs). What remains of the
 * error's text is redacted for what it commonly names. This is a list of
 * what to keep, not a list of what to drop: an SDK that learns to attach one
 * more thing does not start sending it.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const exception = event.exception?.values?.map((value) => ({
    ...value,
    ...(value.value === undefined ? {} : { value: redact(value.value) }),
    // Variables a frame was captured with are the visitor's data too.
    ...(value.stacktrace
      ? {
          stacktrace: {
            ...value.stacktrace,
            frames: value.stacktrace.frames?.map(withoutVars),
          },
        }
      : {}),
  }));
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    tags: event.tags,
    sdk: event.sdk,
    ...(event.message === undefined ? {} : { message: redact(event.message) }),
    ...(exception ? { exception: { values: exception } } : {}),
    type: undefined,
  };
}
