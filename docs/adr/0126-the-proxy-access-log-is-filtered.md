# 0126 — The proxy can write an access log, and it leaves out what a request carries

**Status**: Accepted — 2026-10-13. Completes
[0122](0122-the-log-can-be-json.md), which left "Caddy's access log needs its
request headers filtered (the cookie is one) before it is a thing to turn on".

## Context

ADR-0122 gave the API a line for each request (`KOMETIO_ACCESS_LOG=true`) and
left the proxy's out. The API's line covers the API; a server with a `DOMAIN` has
Caddy in front of three things, and the site and the editor are never seen by the
API at all. The page that was slow, or the one asked for ten thousand times that
does not exist, is a line of the proxy's.

Caddy's access log is a line for each request with everything the request
carried. It redacts the values of `Cookie`, `Set-Cookie`, `Authorization` and
`Proxy-Authorization` (`log_credentials` is off), which is the part that is
thought of; **every other header is there as it came**: a header a client chose
for a token, the `Referer` with its own query, the browser. So is the client's
address and port, and the full URI with its query, where a preview link's token
is. Turned on as it comes, it writes those into a file that is kept for weeks,
rotated by Docker and read by whoever collects the logs (measured on the image's
Caddy: `X-Preview-Token`, a `Referer`'s query and the request's query all came
out as they were, and the cookie as `REDACTED`).

## Decision

- **The proxy's log is on the same switch as the API's**: `KOMETIO_ACCESS_LOG`.
  One setting is the whole log of a request, and the compose stack and the image
  pass the variable through. The Caddyfile imports a snippet named for its value,
  `access_log_true` or `access_log_false`, in each site: with `false` there is no
  `log` directive anywhere, and Caddy writes no line of a request, as it never
  did. (The image maps anything that is not `true` to `false`; the compose file
  says `${KOMETIO_ACCESS_LOG:-false}`, because an empty value is not a name.)
- **A line is what is left after the rest is deleted, not after the secrets
  are.** The filter encoder removes `request>headers` and `resp_headers` as a
  whole, the client's address (`remote_ip`, `remote_port`, `client_ip`), the TLS
  block, and the query from `request>uri`. Caddy's own list of what to redact is
  four headers long, and a list of the secrets to remove is a list that is
  missing the one that matters: the next header a client invents, or the one a
  new feature adds, would be written. A line is: time, method, host, path, status, size, duration, bytes
  read, protocol. One snippet, `request_log_format`, says it.
- **The same format is on Caddy's own (default) log**, in the global options. A
  request for a name that has no site here — the machine's address, a scanner's
  guess, the redirect from port 80 — is not given to any site's logger, and once
  one site has a `log` directive it is written to the default access log, with
  every header and the address. That is what the first version of this did, and
  what `check.sh` found: the launcher's own probe of port 80 was a line with a
  `Host` of `127.0.0.1`, its headers and its address, and it was there with the
  switch off as well. The default log carries the access lines of unmapped names
  and the request of an error's line, so the format is on it, always.
- **It is the same stance as the API's**: ADR-0122 records no address, no browser
  and no query. A person who needs the address of a client has a proxy of their own
  to put it in; this is the one that is shipped.
- **No change to what the launcher does with it**: a JSON line from Caddy is kept
  as it is with `service: "caddy"` added, access lines included.

## What was tried first

A `log_skip` on a CEL matcher over `{env.KOMETIO_ACCESS_LOG}` keeps one `log`
directive and no snippet names. It works for the sites, and it is why the first
version of this passed its own test: a single site block has no unmapped hosts.
Put in the real Caddyfile it left the default logger on with the switch off, and
`log_skip` does not reach it. `no_hostname` (which looks as if it makes a site's
logger the default) sends every request to the unfiltered default log instead.
A snippet per value is the one that makes "off" the absence of the directive.

## Verified

- Against the Caddy of the image (2.11.4), with requests that carried a cookie, a
  bearer token, a header of their own, a `Referer` with a query, a user agent and a
  query — to a site name, to a name over HTTP, to the address: every line has the
  path and the status and none of them; with `false` there is none.
- In `check.sh`, on the image with a `DOMAIN`, twice on one volume: without the
  variable no line of a request and no secret anywhere in the container's log; with
  it a line for the site's name, one for the address, none with an address, a port
  or a header, none with any of six secrets.

## Not in this change

- **The site's own access log, with no proxy.** A trial on plain ports has the
  site answering directly, and the Astro server writes nothing. The proxy of a
  server covers it; for a trial, the log is the API's.
- **Rotation and retention.** The container's log is Docker's, with the limits
  the README's `docker run` gives it.
- **Metrics, alerts, a status page.** The rest of the review's OPS-3 is not this.

## Consequences

- `KOMETIO_ACCESS_LOG=true` on a server gives a line per request for every name it
  serves, in the same stream and, with `KOMETIO_LOG_FORMAT=json`, in the same format.
- A header a request carries is never written, now or when a new one is added; an
  error's line from Caddy no longer carries the request's headers either.
- A line of the proxy's cannot be tied to a person: that is the cost, and it is
  paid on purpose.
- A value of `KOMETIO_ACCESS_LOG` that is neither `true` nor `false` stops the
  proxy of the compose stack with "File to import not found: access_log_…"; the
  API stops first, with the better message.
