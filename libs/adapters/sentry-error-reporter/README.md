# sentry-error-reporter

`ErrorReporterPort` implementation on the Sentry SDK: where an error nobody
expected is sent, when the deployment has somewhere to send it
([ADR-0114](../../../docs/adr/0114-unexpected-errors-go-where-the-deployment-says.md)).
Off unless `SENTRY_DSN` is set; with none, nothing is started and nothing is
sent.

## Implements

`ErrorReporterPort` (`libs/ports/src/lib/error-reporter.port.ts`) —
`captureException(error, { requestId, method, path, fatal })` and
`flush(timeoutMs)`, which the API uses before the process exits on a crash.

## How it works

- **Minimal SDK.** `@sentry/node-core/light` (no OpenTelemetry provider),
  started **without** its default integrations: no HTTP-server
  instrumentation, no console capture, no breadcrumbs, no tracing, no
  profiling, no sessions. Two integrations are named: the `cause` chain
  (`linkedErrors`) and de-duplication.
- **A list of what to keep, not of what to drop** (`scrubEvent`), field by
  field down to the fields of an exception and of a stack frame. What leaves
  is the error (type, message, how it was caught, the places in the code),
  the level, the environment, the release, and the tags the application set:
  `service`, `request_id`, `http_method`, `http_path`. No request, no user,
  no machine name, no `extra`, no breadcrumbs, no source lines, no variables:
  a field an SDK learns to attach later does not travel until somebody adds
  it here.
- **The words of the error are kept from a list of what is safe** (`redact`).
  A list of what a secret looks like is always one entry short: every
  encoding of an address, every separator, every alphabet is another. So a
  word is kept only if it is a plain word (letters, with the punctuation of a
  sentence around it), a number of up to four digits, or a marker; an address,
  a path, a token, a longer number, `key=value`, JSON, an escape, an entity is
  none of those and is replaced by `…`. Three whole-message rules come first,
  for secrets made of plain words that only their name gives away: the values
  of a failed query (`params:`, to the end of the message), a value written
  beside the name of what it is (`password=…`, `"access_token": "…"`,
  `X-Api-Key: …`, the keyword looked for inside the name), and an
  Authorization value. The tags are held to what they should be: a path of
  slugs and ids, a method, an id of a length and an alphabet.
- **Bounded, and never cut through a word.** A message is read up to 16,000
  characters and cut between words (half of a secret is still half of one); a
  run of more than 256 characters is data and is not kept, so that nothing
  scans a long text from every position; an event keeps at most ten
  exceptions of at most a hundred frames each. The worst message measured
  takes a millisecond. A process sends at most 20 reports a minute, a fatal
  one excepted.
- **A DSN is validated** (`assertSentryDsn`): one that is not a DSN is
  refused with the variable's name (the API refuses to start; the public site
  logs it and runs unreported), not silently ignored by the SDK. The value is
  never written into the message, and plain `http` is refused unless it points
  at this machine.
- **Bounded, and never cut through a word.** A message is read up to 16,000
  characters and cut at a word, not in the middle of one (half of a secret is
  still half a secret); each word of it is at most 256 characters, and a longer
  run is data and is replaced whole (`[long]`), so that the rules, which scan
  forward from every position, run over a constant; the worst message measured
  takes 4 ms. A process sends at most 20 reports a minute, a fatal one
  excepted.

## Configuration

`SENTRY_DSN` (empty = off), `SENTRY_ENVIRONMENT` (default `production`),
`SENTRY_RELEASE`. Read by `apps/api` (`env-schema.ts`) and by
`apps/public-site` (`src/lib/error-reporter.ts`), and passed to the public
site by the compose file and by the single image's launcher.

## Used by

`apps/api` (the request filter, and the handlers for an unhandled rejection
and an uncaught exception) and `apps/public-site` (its middleware).

## Running unit tests

Run `nx test sentry-error-reporter`. The reporter's spec runs the real SDK
against a stand-in for Sentry's ingest endpoint on a local port and reads what
arrived, so what is checked is what leaves the process.
