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
  user, machine name, extra data or breadcrumbs, and the SDK is started
  without its default integrations, so it learns none of those to begin with.
- **The text of the error is kept word by word from a list of what is safe**,
  not by removing what looks like a secret. The second was built first, and
  five rounds of review each found another way to write an address (a
  percent-encoding, a double one, an entity, a full-width character, a
  zero-width space, a fourth layer of encoding): a list of what a secret looks
  like is always one entry short. Now a word is kept only if it is a plain
  word, a number of up to four digits, or a marker; everything else is `…`.
  Three whole-message rules come first, for secrets that are made of plain
  words and are only given away by their name: the values of a failed query,
  a value written beside the name of what it is, an Authorization value.
  What is lost is the detail of a message (`connect ECONNREFUSED …`); the
  stack and the tags carry where.
- **Bounded, and never cut through a word**: a message is read up to 16,000
  characters and cut between words (half a secret is still half a secret); a
  run of more than 256 characters is not kept, and an event keeps at most ten
  exceptions of a hundred frames. A process sends at most 20 reports a minute,
  a fatal one excepted: a visitor who can make the server throw can make it
  throw as often as they like.
- **The SDK is `@sentry/node-core/light`.** `@sentry/node` 11 depends on the
  bundler plugins, which depend on Sentry's command-line client (15 MB) and a
  native parser: nothing a server that only reports errors needs to install.
- **Bounded, and never cut through a word**: a message is read up to 16,000
  characters and cut between words (half a secret is still half a secret); the
  rules run over one word at a time, and a word longer than 256 characters is
  data, replaced whole — the rules scan forward from every position, and over a
  whole message their time was the square of its length (80,000 characters took
  four seconds). A process sends at most 20 reports a minute, a fatal one
  excepted: a visitor who can make the server throw can make it throw as often
  as they like.
- **A DSN that is not one**: the API refuses to start, naming the variable
  (the SDK would accept it and send nowhere, and a deployment would believe it
  was watched). The public site, which is what visitors reach, logs it once and
  runs unreported.

## Consequences

- A deployment that wants to hear about its errors sets one variable; one that
  does not has the same behaviour as before, plus an unused library.
- A plain word is not known to be harmless: a name, or a password made of
  letters and not written beside its name, is a plain word. That is the one
  thing this cannot see, and the first of two layers: the Sentry
  project has its own server-side data scrubbing (Settings → Security &
  Privacy → Data Scrubber, with Prevent Storing of IP Addresses), which
  should be on for a project that receives these reports, and which
  self-hosting.md says. What Kometio does not do is trust either layer with
  something it could simply not send: nothing of the request, no variables,
  no breadcrumbs.
- The messages of unexpected errors are sent, as plain words and nothing else.
  An error whose text is a name or a phrase somebody typed would carry it;
  that is the cost of hearing about the error at all, and the reason the
  project is the deployment's own to choose, in the region it chooses (Sentry
  has one in the EU).
- The editor (the browser) is not covered: a client-side SDK needs its own
  decision about the CSP and what a browser may send. Not done here.
- Checked with the real SDK against a stand-in for Sentry's endpoint: in the
  adapter's spec; on a built public site against a stand-in API that answers
  500 (the event arrives with the tags and none of the query that was in the
  address; with no DSN, nothing arrives); and on the built API, which with its
  database unreachable ends with a `fatal` event and exit code 1.
