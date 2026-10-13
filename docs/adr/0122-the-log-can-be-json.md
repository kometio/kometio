# 0122 — The log can be JSON, and a request can be a line of it

**Status**: Accepted — 2026-10-13.

## Context

The container's log was text from six sources: the launcher's own lines
(`[kometio] …`), Postgres and nginx in their own formats, Caddy's JSON, the
API's NestJS lines, and what the public site writes. Behind `[api]` and the
other prefixes, a line was whatever its part wrote. A collector (Loki, Datadog,
a `jq` pipe on a server) cannot read that without a parser for each; the review
of 2026-10-11 listed it ("log JSON e access log").

There was also no line for a request that went well. The exception filter
writes every request that failed, with its id; one that was slow, or that
somebody asks about, left nothing.

## Decision

- **`KOMETIO_LOG_FORMAT=json`** (`text` is the default; anything else refuses
  to start, in the launcher and in the API). It is read by the launcher and by
  the API, which are the two things that write lines of their own.
- **In the API** it is NestJS's own JSON logger (`ConsoleLogger({ json: true })`):
  every `Logger` of ours and the framework's come out as one object, with
  `level`, `pid`, `timestamp`, `message`, `context` and a `stack` on an error.
  No logger of our own was written.
- **In the single image** the launcher makes the whole stream JSON, because a
  collector reads the container's, not each part's: every line is one object
  with `service`: the parts (`postgres`, `api`, `site`, `editor`, `caddy`), the
  launcher (`kometio`) and the steps it runs before them (`initdb`, `migrate`). A line
  a part wrote as a JSON object (the API's, Caddy's) is kept as it is, with
  `service` added and its own field names left alone; a line of text is wrapped
  (`level: "log"`, `timestamp`, `stream`, `message`). A line that only looks like
  JSON — an array, a number, a broken object — is text.
- **The banner is lines too**, one object each, and the setup token is still a
  line of its own. The launcher reads the token out of the API's output to
  show it in the banner; with JSON logs the API writes the box as one message,
  so the launcher reads the lines of the message (`messageLines`).
- **The commands are always text.** `export`, `import` and `backup` are run by
  a person, and their stdout is a file.
- **`KOMETIO_ACCESS_LOG=true`** adds one line per request to the API's log, on
  `finish`: method, path without its query, the route's pattern, status, duration,
  response size, the request id and the signed-in user's id. In JSON it is a flat
  object with the same `level`/`pid`/`timestamp`/`context` as the others, so one
  filter reads both; in text, one sentence through the logger. It is the first
  middleware, so that a request refused by a later one is in it too. The health
  check is not a line: Docker asks it every ten seconds, and on a quiet site it
  would be the log.

## Found on the way

The check that sends a request with a secret in its query and looks for it in
the log found it there already, in the text log as well: the exception filter
writes the path without its query, as it says it does, and then the _message_ of
the exception — and Nest's own answer to a route that does not exist is
`Cannot GET <url>`, query included. A preview link's token that reached a
mistyped route was written to the log. The filter now replaces the request's URL
with its path in what it writes (the response body is the caller's own and is
unchanged), and the filter's spec has the case.

## Not in this change

- **The address, the browser and the query are not recorded.** A query can carry
  a token (a preview link does) and an address is personal data; both are for
  the proxy in front, which a server has, to decide about.
- **The access log is off by default.** It is the most frequent line there is;
  on a small server with a rotating log it would push an hour of errors out of
  it. It is one variable away.
- **The public site's access log**, and Caddy's, are not added. The site's own
  lines (a handful) are wrapped by the launcher; with `docker-compose.prod.yml`,
  where each service is its own container, the site's and Postgres's lines stay
  text. Caddy's access log needs its request headers filtered (the cookie is one)
  before it is a thing to turn on.
- **No metrics, alerts or status page.** The rest of the review's OPS-3 is not
  this.
- **The format of foreign JSON is not unified.** Caddy's `ts`/`msg` are not
  renamed to `timestamp`/`message`; a collector that wants one schema maps it.

## Consequences

- With the default nothing changes: the same text, the same prefixes, the same
  stream for the launcher's errors (stderr).
- `docker logs kometio | jq -c 'select(.service=="api" and .level=="error")'`
  works with the one variable.
- A new part of the image that writes to stdout is covered without a line of
  code: its lines are wrapped under the name it was started with.
- `check.sh` starts an image with JSON logs and an access log, sends one request
  with a query, and checks the log: every line an object with a `service`, the
  launcher, the API and Postgres in it, the request as a line with its id and
  status, the query nowhere, the token as a line of its own.
