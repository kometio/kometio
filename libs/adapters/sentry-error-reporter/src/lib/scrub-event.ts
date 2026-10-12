import type {
  ErrorEvent,
  Exception,
  StackFrame,
} from '@sentry/node-core/light';

/** How much of an error's words is kept, after redacting them. */
const MAX_TEXT_LENGTH = 1000;

/**
 * How much of a message is read at all. A message is whatever the code that
 * threw it put there, a request's body included; a text this long is not a
 * message, and what is past it is not read.
 */
export const MAX_REDACTED_INPUT_LENGTH = 16_000;

/**
 * The longest run of non-space characters that is still a word of a message.
 * A longer one is data (a body, a blob, an address with a long query), and is
 * replaced whole: a rule that found part of a secret in it would leave the
 * rest, and the rules below are only safe to run on a run this short.
 */
const MAX_WORD_LENGTH = 256;

/** A character that cannot be part of the name or the host of an email address, written in a message. */
const NOT_ADDRESS = String.raw`\s@<>()\[\]{}"'` + '`' + String.raw`,;:/\\`;

/**
 * What an error's own words may carry out with them: the text of an error is
 * whatever the code that threw it put there, and a failed query, a failed
 * fetch or a failed connection names its values. Each rule is a thing that
 * has been seen in such a message or that one would expect to be.
 *
 * Applied to ONE WORD at a time (a run of non-space characters, at most
 * `MAX_WORD_LENGTH` long): several of these scan forward from every position,
 * and over a whole message their time is the square of its length (80,000
 * characters took four seconds). Over a word of 256 it is a constant.
 */
const WORD_RULES: readonly (readonly [RegExp, string])[] = [
  // What stands before the `@` of an address with a scheme: a connection
  // string with its password.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@?#]+@/gi, '$1[credentials]@'],
  // The query of an address, absolute or not: a token, an id, a search.
  [/\?[\w.~%+-]+=[^\s#"'`)>]*/g, '?[query]'],
  // An email address, whatever is after the `@` (`ana@localhost`) and
  // whatever alphabet it is written in.
  [new RegExp(`[^${NOT_ADDRESS}]+@[^${NOT_ADDRESS}]+`, 'g'), '[email]'],
  // A JSON web token on its own.
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]'],
  // A password hash.
  [/\$argon2[a-z]*\$[^\s"'`)]+/g, '[hash]'],
  // A secret written in hexadecimal (a UUID is not: its runs are shorter).
  [/\b[0-9a-f]{32,}\b/gi, '[token]'],
  // A session written as a cookie, or as a parameter.
  [/\b(kometio_[a-z_]+|[a-z_]*session[a-z_]*|sid)=[^;\s]+/gi, '$1=[token]'],
];

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

/** What Sentry keeps of a tag's value: more is dropped on the other side. */
const MAX_TAG_LENGTH = 200;

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

/**
 * The word as whoever reads it would read it: a percent-encoded address, a
 * JSON `\u0040`, a numeric entity, a full-width `＠` are the same text, and a
 * rule written for the plain one does not see them. What is redacted is the
 * decoded form, so what is sent is that form with the secret gone.
 */
function normalised(word: string): string {
  let text = word;
  // More than once: `%2540` is `%40` is `@`, and a report goes through
  // several layers that each add one. Bounded, and stopping when a pass
  // changes nothing.
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const decoded = decodeOnce(text);
    if (decoded === text) break;
    text = decoded;
  }
  return (
    text
      .normalize('NFKC')
      // Format and control characters (a zero-width space, a bell) are not
      // text, and one in the middle of a token is what stops a rule seeing it.
      .replace(/[\p{Cf}\p{Cc}]/gu, '')
  );
}

/** How many layers of encoding are peeled off a word. */
const MAX_DECODE_PASSES = 3;

/** The few named entities for the punctuation an address, a query or an assignment is made of. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  commat: '@',
  period: '.',
  colon: ':',
  equals: '=',
  quest: '?',
  sol: '/',
  lowbar: '_',
  num: '#',
  amp: '&',
};

function decodeOnce(text: string): string {
  let decoded = text;
  if (/%[0-9a-f]{2}/i.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // A malformed escape: the word is kept as it was written.
    }
  }
  return decoded
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (escape, hex: string) =>
      codePointOr(Number.parseInt(hex, 16), escape),
    )
    .replace(/\\u([0-9a-f]{4})/gi, (escape, hex: string) =>
      codePointOr(Number.parseInt(hex, 16), escape),
    )
    .replace(/\\x([0-9a-f]{2})/gi, (escape, hex: string) =>
      codePointOr(Number.parseInt(hex, 16), escape),
    )
    .replace(/&#x([0-9a-f]{1,6});/gi, (entity, hex: string) =>
      codePointOr(Number.parseInt(hex, 16), entity),
    )
    .replace(/&#(\d{1,7});/g, (entity, digits: string) =>
      codePointOr(Number.parseInt(digits, 10), entity),
    )
    .replace(
      /&([a-z]+);/gi,
      (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity,
    );
}

function codePointOr(codePoint: number, original: string): string {
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : original;
}

function redactWord(word: string): string {
  if (word.length > MAX_WORD_LENGTH) return '[long]';
  const text = normalised(word);
  // Normalising can make a word longer (a ligature is several letters): the
  // rules are only safe to run over a word of this length, decoded or not.
  if (text.length > MAX_WORD_LENGTH) return '[long]';
  return WORD_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

export function redact(text: string): string {
  if (typeof text !== 'string') return '';
  const read = cutAtWord(text, MAX_REDACTED_INPUT_LENGTH);
  const paramsAt = read.search(QUERY_PARAMS);
  const head = paramsAt === -1 ? read : read.slice(0, paramsAt);
  const redacted = head
    .split(/(\s+)/)
    .map((part, index) => (index % 2 === 1 ? part : redactWord(part)))
    .join('')
    .replace(SECRET_ASSIGNMENT, '$1$2[redacted]')
    .replace(AUTHORIZATION, '$1 [token]');
  const withParams = paramsAt === -1 ? redacted : `${redacted}params: [values]`;
  const kept = cutAtWord(withParams, MAX_TEXT_LENGTH);
  return kept.length < withParams.length ? `${kept}…` : kept;
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
