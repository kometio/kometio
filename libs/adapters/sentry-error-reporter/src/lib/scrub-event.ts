import type {
  ErrorEvent,
  Exception,
  StackFrame,
} from '@sentry/node-core/light';

/** How much of an error's words is kept. */
const MAX_TEXT_LENGTH = 1000;

/**
 * How much of a message is read at all. A message is whatever the code that
 * threw it put there, a request's body included; a text this long is not a
 * message, and what is past it is not read.
 */
export const MAX_REDACTED_INPUT_LENGTH = 16_000;

/** The longest run of non-space characters that is still read as a word: a longer one is data. */
const MAX_WORD_LENGTH = 256;

/** What of an event's lists is kept: a stack of thousands of frames is not one that is read. */
const MAX_EXCEPTIONS = 10;
const MAX_FRAMES = 100;

/** What Sentry keeps of a tag's value: more is dropped on the other side. */
const MAX_TAG_LENGTH = 200;

/** What stands where a word is not kept. */
const MASK = '…';

/*
 * The text of an error is whatever the code that threw it put there, and a
 * failed query, a failed fetch or a failed connection names its values. A
 * list of what a secret looks like is a list that is always one entry short:
 * every encoding of an address, every separator, every alphabet is another
 * entry. So the words are kept from a list of what is safe instead, and what
 * is not on it is not sent.
 *
 * Three whole-message rules come first, for the secrets that are made of
 * plain words and so look like nothing: the values of a failed query, a
 * value written beside the name of what it is, an Authorization value. Then
 * every word is kept only if it is a plain word (letters, with the
 * punctuation of a sentence around it), a small number or one of the markers
 * this file writes. An address, a path, a token, a number with more than four
 * digits, `key=value`, JSON, an escape, an entity: none of them is a plain
 * word, and none of them is kept.
 */

/**
 * The values a failed query was run with. Drizzle writes them after the SQL
 * (`Failed query: insert … values ($1, $2)\nparams: <values>`): a person's
 * email, a password hash, a page's text. From there to the end of the
 * message, because a value can have a line break in it.
 */
const QUERY_PARAMS = /\bparams\s*:/i;

/**
 * A value that is written next to the name of what it is: `password=…`,
 * `"access_token": "…"`, `X-Api-Key: …`. The name is what gives it away, and
 * the value may have spaces in it when it is quoted.
 *
 * The keyword is looked for INSIDE the name (`access_token`, `refreshToken`,
 * `client_secret`, `passwordHash`): `\b` would not see it, because `_` is a
 * word character and a camel-cased name has no boundary at all. What is
 * matched ends the name (`[\w.-]*`) and takes the value; what began the name
 * is left as it was. It is anchored on the keyword, which keeps it linear.
 */
const SECRET_ASSIGNMENT =
  /(password|passwd|passphrase|pwd|secret|token|api[_-]?key|authorization|cookie|credential|session|csrf|xsrf|private[_-]?key)([\w.-]*["']?\s*[:=]\s*)(?:(?:Bearer|Basic|Digest)\s+)?(?:"[^"]*"|'[^']*'|[^\s"',;}]+)/gi;

/** An Authorization value is two words, the scheme and the credential. */
const AUTHORIZATION = /\b(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]+/gi;

/** The markers this file writes in place of what it removed. */
const MARKER = /^\[(?:redacted|values)\]$/;

/** A plain word: letters, with `_`, `-` and an apostrophe inside, and the punctuation of a sentence around it. */
const PLAIN_WORD = /^[("'[]*[\p{L}\p{M}][\p{L}\p{M}_'’-]{0,23}[)"'\],.:;!?]*$/u;

/** A number of up to four digits: a status, a line, a count. Five could be a postcode and eight a phone number. */
const SMALL_NUMBER = /^[("'[]*\d{1,4}[)"'\],.:;!?]*$/;

/** Punctuation standing alone (`->`, `::`, `(`): it carries nothing. */
const PUNCTUATION = /^[-–—:;,.!?()[\]'"|>*+]{1,3}$/;

function isSafeWord(word: string): boolean {
  return (
    MARKER.test(word) ||
    PLAIN_WORD.test(word) ||
    SMALL_NUMBER.test(word) ||
    PUNCTUATION.test(word)
  );
}

/**
 * `text` cut to at most `max` characters, between two words. The word the cut
 * would split is dropped whole: half of a secret is no more a secret to the
 * rules, and is still half a secret. A text that is one word longer than
 * `max` has no place to be cut, and is not kept.
 */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  if (/\s/.test(text.charAt(max))) return text.slice(0, max);
  for (let at = max - 1; at > 0; at -= 1) {
    if (/\s/.test(text.charAt(at))) return text.slice(0, at);
  }
  return '';
}

export function redact(text: string): string {
  if (typeof text !== 'string') return '';
  const read = cutAtWord(text, MAX_REDACTED_INPUT_LENGTH);
  const paramsAt = read.search(QUERY_PARAMS);
  const head = (paramsAt === -1 ? read : read.slice(0, paramsAt))
    .replace(SECRET_ASSIGNMENT, '$1$2[redacted]')
    .replace(AUTHORIZATION, '$1 [redacted]');
  const kept = head
    .split(/(\s+)/)
    .map((part, index) => {
      if (index % 2 === 1 || part === '') return part;
      if (part.length > MAX_WORD_LENGTH) return MASK;
      return isSafeWord(part) ? part : MASK;
    })
    .join('')
    // Several words in a row that were not kept are one gap, not several.
    .replace(new RegExp(`${MASK}(?:\\s+${MASK})+`, 'g'), MASK);
  const withParams = paramsAt === -1 ? kept : `${kept}params: [values]`;
  const cut = cutAtWord(withParams, MAX_TEXT_LENGTH);
  return cut.length < withParams.length ? `${cut}${MASK}` : cut;
}

/**
 * A file as a stack names it: segments of letters, digits and `._~+-`, a
 * leading `@` for a scope, an optional scheme. A query, an `@` inside a name,
 * a space or a percent sign are not part of one.
 */
const CODE_PATH =
  /^(?:[a-z][a-z0-9+.-]*:\/{0,3}|\/)?(?:@?[\w.~+-]+\/)*@?[\w.~+-]+$/i;
/** A function as a stack names it: an identifier path, `<anonymous>`, `async x`, `Class.method [as alias]`. */
const CODE_NAME = /^[\w$.<>[\]#:()\s-]{1,200}$/;
/** A name given to a deployment or a release: no spaces, no `@`. */
const LABEL = /^[\w.+-]{1,64}$/;

/** Only where in the code it was: no source lines, no variables, nothing an integration may add later. */
function keepFrame(frame: StackFrame): StackFrame {
  const kept: StackFrame = {};
  const path = (value: string | undefined): value is string =>
    value !== undefined && value.length <= 300 && CODE_PATH.test(value);
  if (path(frame.filename)) kept.filename = frame.filename;
  if (path(frame.abs_path)) kept.abs_path = frame.abs_path;
  if (frame.function !== undefined && CODE_NAME.test(frame.function)) {
    kept.function = frame.function;
  }
  if (path(frame.module)) kept.module = frame.module;
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
    // The innermost frames are the last ones: it is the end that is kept.
    kept.stacktrace = {
      frames: value.stacktrace.frames.slice(-MAX_FRAMES).map(keepFrame),
    };
  }
  return kept;
}

/** A path segment that is a slug or an id: letters, digits, `_`, `-`, `.`, `~`, and not long enough to be a secret. */
const PATH_SEGMENT = /^[A-Za-z0-9_.~-]{1,64}$/;
const HEX_SECRET = /^[0-9a-f]{32,}$/i;

/**
 * A path as the application wrote it, with what is not a slug or an id
 * masked: an address in a segment, an encoded one, a token.
 */
function safePath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment === '' ||
      (PATH_SEGMENT.test(segment) && !HEX_SECRET.test(segment))
        ? segment
        : MASK,
    )
    .join('/')
    .slice(0, MAX_TAG_LENGTH);
}

/**
 * What the application puts in a tag is a method, a path and an id it was
 * given by a client (`X-Request-Id`): each is held to what it should be.
 */
function safeTag(name: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (name === 'http_path') return safePath(value);
  if (name === 'http_method') return /^[A-Z]{1,10}$/.test(value) ? value : MASK;
  if (name === 'request_id') {
    return /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : MASK;
  }
  return redact(value).slice(0, MAX_TAG_LENGTH);
}

function redactTags(
  tags: ErrorEvent['tags'],
): { tags: NonNullable<ErrorEvent['tags']> } | Record<string, never> {
  if (!tags) return {};
  return {
    tags: Object.fromEntries(
      Object.entries(tags).map(([name, value]) => [name, safeTag(name, value)]),
    ) as NonNullable<ErrorEvent['tags']>,
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
 * learns to attach one more thing does not start sending it. The text that
 * is kept is kept word by word from a list of what is safe (`redact`).
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    ...(event.environment !== undefined && LABEL.test(event.environment)
      ? { environment: event.environment }
      : {}),
    ...(event.release !== undefined && LABEL.test(event.release)
      ? { release: event.release }
      : {}),
    sdk: event.sdk,
    ...redactTags(event.tags),
    ...(event.message === undefined ? {} : { message: redact(event.message) }),
    ...(event.exception?.values
      ? {
          exception: {
            values: event.exception.values
              .slice(0, MAX_EXCEPTIONS)
              .map(keepException),
          },
        }
      : {}),
    type: undefined,
  };
}
