# sentry-error-reporter

`ErrorReporterPort` implementation on the Sentry SDK: where an error nobody
expected is sent, when the deployment has somewhere to send it
([ADR-0114](../../../docs/adr/0114-unexpected-errors-are-reported-only-where-the-deployment-says.md)).
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
- **A list of what to keep, not of what to drop** (`scrubEvent`). What leaves
  is the error (type, message, stack frames without their variables), the
  level, the environment, the release, and the tags the application set:
  `service`, `request_id`, `http_method`, `http_path`. No request, no user,
  no machine name, no `extra`, no breadcrumbs: a field an SDK learns to attach
  later does not travel until somebody adds it here.
- **The words of the error are redacted** (`redact`) for what they commonly
  name: an email address, the query of an address, a bearer token and the
  values a failed query was run with. The
  application also never reports an error it handled (a refused request, a
  missing page, a rule that said no): only what nobody expected.
- **A DSN is validated** (`assertSentryDsn`): one that is not a DSN is
  refused with the variable's name (the API refuses to start; the public site
  logs it and runs unreported), not silently ignored by the SDK.

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
