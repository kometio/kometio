import type {
  ErrorEvent,
  Exception,
  StackFrame,
} from '@sentry/node-core/light';

/** How much of an error's words is kept, after redacting them. */
const MAX_TEXT_LENGTH = 1000;

/**
 * How much of it the rules are run over. Several of them scan forward from
 * every position, so their time is the square of the length: 80,000
 * characters took four seconds, and a message is whatever the code that threw
 * it put there, a request's body included. Four times what is kept: a secret
 * that straddles this cut is a fragment, and is past the final cut anyway
 * unless the text before it shrank to nothing.
 */
const MAX_INPUT_LENGTH = 4 * MAX_TEXT_LENGTH;

/** A character that cannot be part of the name or the host of an email address, written in a message. */
const NOT_ADDRESS = String.raw`\s@<>()\[\]{}"'` + '`' + String.raw`,;:/\\`;

/**
 * What an error's own words may carry out with them: the text of an error is
 * whatever the code that threw it put there, and a failed query, a failed
 * fetch or a failed connection names its values. Each rule is a thing that
 * has been seen in such a message or that one would expect to be; the order
 * is the order they are applied in.
 */
const RULES: readonly (readonly [RegExp, string])[] = [
  // The values a failed query was run with. Drizzle writes them after the
  // SQL (`Failed query: insert … values ($1, $2)\nparams: <values>`): a
  // person's email, a password hash, a page's text. To the end of the
  // message, because a value can have a line break in it.
  [/\bparams:[\s\S]*$/, 'params: [values]'],
  // What stands before the `@` of an address with a scheme: a connection
  // string with its password.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@?#]+@/gi, '$1[credentials]@'],
  // The query of an address, absolute or not: a token, an id, a search.
  [/\?[\w.~%+-]+=[^\s#"'`)>]*/g, '?[query]'],
  // An email address, whatever is after the `@` (`ana@localhost`) and
  // whatever alphabet it is written in.
  [new RegExp(`[^${NOT_ADDRESS}]+@[^${NOT_ADDRESS}]+`, 'g'), '[email]'],
  // An Authorization header's value, and a JSON web token on its own.
  [/\b(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [token]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]'],
  // A password hash.
  [/\$argon2[a-z]*\$[^\s"'`)]+/g, '[hash]'],
  // A secret written in hexadecimal (a UUID is not: its runs are shorter).
  [/\b[0-9a-f]{32,}\b/gi, '[token]'],
  // A session written as a cookie, or as a parameter.
  [/\b(kometio_[a-z_]+|[a-z_]*session[a-z_]*|sid)=[^;\s]+/gi, '$1=[token]'],
];

/** What Sentry keeps of a tag's value: more is dropped on the other side. */
const MAX_TAG_LENGTH = 200;

export function redact(text: string): string {
  const redacted = RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    // Bounded before the rules, which are not linear; cut again after them,
    // so that a secret cut in half at the final limit is not left written.
    text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text,
  );
  return redacted.length > MAX_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_TEXT_LENGTH)}…`
    : redacted;
}

/** Only where in the code it was: no source lines, no variables, nothing an integration may add later. */
function keepFrame(frame: StackFrame): StackFrame {
  const kept: StackFrame = {};
  if (frame.filename !== undefined) kept.filename = frame.filename;
  if (frame.abs_path !== undefined) kept.abs_path = frame.abs_path;
  if (frame.function !== undefined) kept.function = frame.function;
  if (frame.module !== undefined) kept.module = frame.module;
  if (frame.lineno !== undefined) kept.lineno = frame.lineno;
  if (frame.colno !== undefined) kept.colno = frame.colno;
  if (frame.in_app !== undefined) kept.in_app = frame.in_app;
  return kept;
}

function keepException(value: Exception): Exception {
  const kept: Exception = {};
  if (value.type !== undefined) kept.type = redact(value.type);
  if (value.value !== undefined) kept.value = redact(value.value);
  if (value.mechanism) {
    // How it was caught, and whether it was handled; its `data` is free-form.
    kept.mechanism = { type: value.mechanism.type };
    if (value.mechanism.handled !== undefined) {
      kept.mechanism.handled = value.mechanism.handled;
    }
  }
  if (value.stacktrace?.frames) {
    kept.stacktrace = { frames: value.stacktrace.frames.map(keepFrame) };
  }
  return kept;
}

function redactTags(
  tags: ErrorEvent['tags'],
): { tags: NonNullable<ErrorEvent['tags']> } | Record<string, never> {
  if (!tags) return {};
  return {
    tags: Object.fromEntries(
      Object.entries(tags).map(([name, value]) => [
        name,
        typeof value === 'string'
          ? redact(value).slice(0, MAX_TAG_LENGTH)
          : value,
      ]),
    ),
  };
}

/**
 * The least an event may carry out: the error, where in the code it was,
 * and the tags the reporter put on it.
 *
 * A list of what to keep, field by field and down to the fields of an
 * exception and of a frame, not a list of what to drop: the request (its
 * headers and cookies carry the session, its body what somebody typed), the
 * person, the machine, `extra`, breadcrumbs, a frame's source lines and
 * variables are absent because nothing here names them, and an SDK that
 * learns to attach one more thing does not start sending it. What is kept
 * of text is redacted.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    sdk: event.sdk,
    ...redactTags(event.tags),
    ...(event.message === undefined ? {} : { message: redact(event.message) }),
    ...(event.exception?.values
      ? { exception: { values: event.exception.values.map(keepException) } }
      : {}),
    type: undefined,
  };
}
