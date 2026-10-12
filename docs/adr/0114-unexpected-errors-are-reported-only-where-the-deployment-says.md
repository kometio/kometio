# 0114 — Unexpected errors are reported only where the deployment says

**Status**: Accepted — 2026-10-12.

## Context

An error nobody expected reached the log and nowhere else. A deployment the
people who wrote Kometio do not run — most of them — has nobody reading that
log until a person writes in, and the one error that ends the process is the
one that cannot say so afterwards. Kometio has no tracker of its own and should
not grow one.

It is also software that holds people's sites: their visitors' form
submissions, their editors' sessions. Whatever reports an error must not become
the place those end up, and a self-hoster must not be sent anywhere they did
not choose.

## Decision

- **Off, unless the deployment gives a `SENTRY_DSN`.** Without one nothing is
  started and nothing is sent (`noErrorReporter`). `SENTRY_ENVIRONMENT` and
  `SENTRY_RELEASE` are optional labels. Kometio ships no default project, and
  the address is never in the repository.
- **A port, `ErrorReporterPort`**, implemented by
  `@kometio/sentry-error-reporter`, used by the API and by the public site. The
  application hands over a context with nothing of the visitor in it (request
  id, method, path without its query, whether it is fatal).
- **Only what nobody handled is reported.** In the API that is the error the
  request filter could not map to an answer (the fallback 500), and the two
  handlers that end the process (unhandled rejection, uncaught exception),
  which flush for two seconds before exiting. A refused request, a missing page,
  a domain rule that said no and the 503 of an installation not yet set up are
  the application working, and are in the log. In the public site, what a route
  throws.
- **What leaves is a list of what to keep**, not of what to drop, field by
  field down to an exception and a frame: the error (type, message, how it was
  caught, the places in the code), level, environment, release and the
  application's own tags. No request, headers, cookies, body, query string,
  user, machine name, extra data or breadcrumbs, and the SDK is started without
  its default integrations, so it learns none of those to begin with. The
  words of the error and the tags are redacted by an ordered list of rules, for
  what such messages have been seen to carry: the values a failed query was run
  with (Drizzle writes them after the SQL), the credentials of a connection
  string, the query of an address, an email address, an Authorization value, a
  token, a password hash, a session cookie; and they are cut at 1000
  characters.
- **The SDK is `@sentry/node-core/light`.** `@sentry/node` 11 depends on the
  bundler plugins, which depend on Sentry's command-line client (15 MB) and a
  native parser: nothing a server that only reports errors needs to install.
- **Bounded**: the redaction rules run over at most 4000 characters of a
  message (they are not linear, and a message is whatever the code that threw
  it put there: 80,000 characters took four seconds), and a process sends at
  most 20 reports a minute, a fatal one excepted — a visitor who can make the
  server throw can make it throw as often as they like.
- **A DSN that is not one**: the API refuses to start, naming the variable
  (the SDK would accept it and send nowhere, and a deployment would believe it
  was watched). The public site, which is what visitors reach, logs it once and
  runs unreported.

## Consequences

- A deployment that wants to hear about its errors sets one variable; one that
  does not has the same behaviour as before, plus an unused library.
- The messages of unexpected errors are sent, redacted for what they commonly
  carry; an error whose text names something else a person typed would carry
  it. That is the cost of hearing about the error at all, and the reason the
  project is the deployment's own to choose, in the region it chooses
  (Sentry has one in the EU).
- The editor (the browser) is not covered: a client-side SDK needs its own
  decision about the CSP and what a browser may send. Not done here.
- Checked with the real SDK against a stand-in for Sentry's endpoint: in the
  adapter's spec; on a built public site against a stand-in API that answers
  500 (the event arrives with the tags and none of the query that was in the
  address; with no DSN, nothing arrives); and on the built API, which with its
  database unreachable ends with a `fatal` event and exit code 1.
