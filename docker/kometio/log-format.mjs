// How the container's log is written (docs/adr/0122).
//
// `text`, the default, is what a person reads in `docker logs`: a line a part
// writes, behind its name in brackets. `json` is for a log collector: every line
// the container writes is one JSON object, so that a pipeline never meets a line
// it cannot parse and can tell the parts apart by `service`.
//
//   text   [api] [Nest] 41  - 10/13/2026, 10:22:51 AM     LOG [Setup] ...
//   json   {"service":"api","level":"log","pid":41,"timestamp":1791881127287,...}
//
// A line a part already writes as a JSON object (the API's, with
// KOMETIO_LOG_FORMAT=json; Caddy's) is kept as it is, with `service` added: its
// own field names are not rewritten into ours. What it writes as plain text
// (Postgres, nginx, the launcher's own lines) is wrapped.
export const LOG_FORMATS = Object.freeze(['text', 'json']);

/**
 * The format the environment asks for. A value that is not one refuses to
 * start, as a mistyped DOMAIN does: a log that quietly stayed text is a
 * collector that drops every line.
 */
export function logFormatOf(env) {
  const value = (env.KOMETIO_LOG_FORMAT ?? '').trim();
  if (value === '') return 'text';
  if (!LOG_FORMATS.includes(value)) {
    throw new Error(
      `KOMETIO_LOG_FORMAT has to be "text" or "json" (it is "${env.KOMETIO_LOG_FORMAT}")`,
    );
  }
  return value;
}

/** The object a line is, if it is a JSON object (an array or a number is not one). */
function objectOf(text) {
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * One line of the log as it is written: `service` is the part it came from and
 * `stream` which of its two outputs. `level` of a line that is wrapped is `log`,
 * the API's name for ordinary: a part that writes everything to stderr (Postgres
 * does) would otherwise be all errors.
 */
export function formatLine(
  format,
  service,
  text,
  { stream = 'stdout', now = Date.now } = {},
) {
  if (format !== 'json') return `[${service}] ${text}`;
  const object = objectOf(text);
  if (object) {
    // Its own `service`, if it wrote one, is not what tells the parts apart.
    const rest = { ...object };
    delete rest.service;
    return JSON.stringify({ service, ...rest });
  }
  return JSON.stringify({
    service,
    level: 'log',
    timestamp: now(),
    stream,
    message: text,
  });
}

/**
 * The lines of text a log line says, for the code that looks for something in
 * what a part wrote (the setup token). A line that is JSON says its `message`,
 * which may hold several lines of its own — the API writes the token's box as
 * one message — and in text it is the line itself.
 */
export function messageLines(line) {
  const object = objectOf(line);
  return object && typeof object.message === 'string'
    ? object.message.split('\n')
    : [line];
}
