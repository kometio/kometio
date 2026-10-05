# 0104 — The image serves a domain over HTTPS

**Status**: Accepted — 2026-10-05

## Context

The single image (ADR-0101) answered on three plain-HTTP ports, which is right
for a trial and wrong for a server: the plan promised that the same image with
`-e DOMAIN=example.com -p 80:80 -p 443:443` would be a site on HTTPS, with no
other tool to install. `DOMAIN` was already in the launcher, as a line saying it
was not used yet.

What a server needs from it: a name, certificates for the names it answers to,
and the three halves reached by name (the site at the name, the editor at
`admin.`, the API at `api.`, as the compose stack has them since ADR-0042).

## Decision

- **Caddy is in the image and runs only when `DOMAIN` is set.** It takes ports 80
  and 443, gets and renews the certificates (Let's Encrypt), redirects HTTP to
  HTTPS, and sends each name to its half, which listen on loopback ports inside
  the container. Without `DOMAIN` nothing changes: three ports, plain HTTP.
  Chosen over asking for a proxy in front (the plan's "one command") and over
  Caddy replacing nginx for the editor (that would define the editor's policy a
  second time; ADR-0101 keeps it in the editor image's own template).
- **One Caddyfile for both.** The compose stack's `Caddyfile` is the image's too:
  the security headers and the compression are defined once. What differs is
  said by environment variables with the compose stack's values as defaults (the
  three upstreams, and two optional lines of global options: the contact email
  for Let's Encrypt, which the image leaves out when it was not given, and
  `admin off`).
- **The admin API of Caddy is off.** It listens on localhost, and in the image the
  public site runs the code of a theme in the same container: it must not be able
  to reconfigure the proxy.
- **`DOMAIN` is the name alone** (`parseDomain`, `docker/kometio/server-mode.mjs`):
  a scheme, a port, a path, a single word, an IP address, or anything that is not a
  hostname is refused at start with what to write, because the certificates are
  asked for what is there, and a wrong name is a failed issuance and a rate limit
  at the certificate authority. The three addresses follow from it; any can still
  be set by hand and then wins, as it does when the image sits behind a proxy of
  one's own.
- **A server is `production` and one hop behind a proxy.** The default for
  `NODE_ENV` is `production` when `DOMAIN` is set (the cookie is `Secure`; the
  example secrets and the test captcha keys are refused), and `TRUSTED_PROXY_HOPS`
  is 1 for the API, so every limit per visitor knows the visitor and not Caddy.
- **The editor moves to a loopback port** (8080) on a server, because Caddy has 80.
  The template is the editor image's own and says `listen 80;`; the launcher
  changes that line and refuses to start if the template no longer has it.
- **Certificates live in the volume** (`/data/caddy`), owned by Caddy alone: a
  restart does not ask the authority again. Caddy runs as its own user and is given
  the one capability that lets it bind a low port.
- **The public site believes `X-Forwarded-Proto` for `https`.** This was a bug
  that the first HTTPS test found, and it is older than this change: behind a
  proxy that ends TLS the site saw plain HTTP, built every request's address as
  `http://`, and Astro's cross-site check (a POST's `Origin` against that address)
  answered 403 to **every form and newsletter signup**. The compose stack had it
  since the day it had Caddy. `security.allowedDomains: [{ protocol: 'https' }]`
  makes Astro read the header for that protocol and no other: a request that
  claims plain HTTP changes nothing. There are no hostnames in it, because one
  built image serves whichever domains its env points at, so Astro also reads
  `X-Forwarded-Host`; all a visitor who could reach the site directly would pick is
  which domain's page this single-site deployment looks up, and the ports are
  published to nobody but the proxy.

## How it is tested

`check.sh` starts a third installation with `DOMAIN` set, on ports 18080 and 18443
and a `.localhost` name (which means this machine to a browser and to this
machine's resolver), where Caddy uses its own certificate authority: no public one
can issue for a name nobody else knows. On it, the first-run test walks the whole
first run in a browser over HTTPS — the wizard, the login across the `admin.` and
`api.` names with a `Secure` cookie, an invitation, a reset, a public form sent
through the built-in captcha — and `check.sh` asserts the transport: each name
answers over HTTPS, the certificate is Caddy's, every response carries HSTS, and
port 80 redirects with a 308. The parsing of `DOMAIN` has unit tests
(`docker/kometio/server-mode.test.mjs`, run by `check.sh`).

## Consequences

- A first server is `docker run` with a name and a mail address, and its DNS: two
  records, the name and `*`.
- **Not tested: issuance by a real certificate authority.** It needs a name that
  answers from the internet, and that is what Caddy does and has done for years;
  what is ours is that the right names reach it, that it can bind the ports, that
  it keeps its certificates and that the apps behind it work over HTTPS. The first
  real server is the first real issuance.
- **Not tested: ports 80 and 443 themselves.** The test maps them to others, and
  gives the three addresses by hand; the addresses `DOMAIN` makes are the unit
  tests'. A machine whose 80 or 443 is taken cannot run it.
- The image is larger by Caddy: 54 MB installed, about 65 MB on disk.
- A server with a database of its own and several instances is still the compose
  stack's (docs/self-hosting.md); this is the single machine.
- One address for everything (`/admin`, `/api`, the site at the root: one DNS
  record) is the plan's third stage, and not this.
