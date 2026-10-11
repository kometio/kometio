# 0110 — An installation behind its own proxy is a server

**Status**: Accepted — 2026-10-11. Amends ADR-0104.

## Context

ADR-0104 made `production` and one trusted proxy hop what `DOMAIN` means: Caddy is
in front, the login cookie is `Secure`, example secrets are refused, and each
visitor is who the proxy says. An installation without `DOMAIN` got none of it, and
that is right for a trial on one's own machine. It is wrong for the other way
people run it: behind a proxy of their own that ends the TLS, with the three
addresses set by hand to `https://…`. There the API was `development`, with the
cookie not `Secure` on a page that is on HTTPS, and it saw every request as coming
from the proxy.

The second is the one that is felt. The login allows five tries per email and
address per minute, and every visitor was the proxy's address: whoever knew the
administrator's email could use the five up, from anywhere, and the administrator
could not sign in for as long as they went on. Found on 2026-10-11, reviewing the
image; the README sent people to this mode without saying to set either variable.

## Decision

- **An address that is `https` is what shows a proxy that ends the TLS.** If any of
  the three addresses (editor, API, site) is `https://` and there is no `DOMAIN`,
  the installation is `production` and trusts one hop, as a server with a name
  does. The rule is `proxyDefaults` in `server-mode.mjs`, with its tests.
- **A default, and only that.** `NODE_ENV` and `TRUSTED_PROXY_HOPS` set by hand
  win: two proxies in front (a CDN, then one's own) is `TRUSTED_PROXY_HOPS=2`.
- **The README says it**, and says what a trial is: the three ports are on every
  address of the machine, and where others can reach it they go on `127.0.0.1`.

Chosen over only documenting the two variables: that is what was there, in effect,
and nobody set them. Chosen over `production` for every installation: a trial on
`localhost` has no TLS, so the cookie would not be sent at all.

## Consequences

- An installation that was behind a proxy of its own over https now runs as
  `production` after an update: it refuses example secrets and Cloudflare's test
  captcha keys (it generates its own secrets, and the captcha is built in unless
  keys are given). One that gave test keys by hand has to give its own.
- One hop is a guess about the chain. With none in front (the address is `https`
  but nothing is in front, which cannot be: the container speaks no TLS), or with
  more than one, the variable says it.
