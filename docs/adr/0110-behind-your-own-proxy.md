# 0110 — Behind a proxy of its own, an installation is production, and trusts nobody it was not told to

**Status**: Accepted — 2026-10-11. Amends ADR-0104.

## Context

ADR-0104 made `production` and one trusted proxy hop what `DOMAIN` means: Caddy is
in front, inside the container, the login cookie is `Secure`, example secrets are
refused, and each visitor is who Caddy says. An installation without `DOMAIN` got
none of it, which is right for a trial on one's own machine and wrong for the
other way people run it: behind a proxy of their own that ends the TLS, with the
three addresses set by hand to `https://…`. There the API was `development`, with
the cookie not `Secure` on a page that is on HTTPS, and it saw every request as
coming from the proxy.

That second one is the one that is felt. The login allows five tries per email and
address per minute, and every visitor was the proxy's address: whoever knew the
administrator's email could use the five up, from anywhere, and the administrator
could not sign in for as long as they went on. Found on 2026-10-11, reviewing the
image, and the README sent people to this mode without saying to set either variable.

## Decision

- **An address that is `https` makes the installation `production`**, with no
  `DOMAIN`: the cookie is `Secure` and example secrets are refused. That is right
  whatever is in front.
- **How many proxies stand in front is never inferred for it.** The first version
  of this trusted one hop when an address was https, and a review of that commit
  found what it costs: the three ports are published on every address by default,
  so the container cannot know that the proxy is the only way in. Where it is not,
  whoever connects directly writes `X-Forwarded-For`, and every try at the login is
  another visitor: the limit that was too tight for everybody became no limit at
  all for an attacker. Trusting the header is the owner's to say, with
  `TRUSTED_PROXY_HOPS` (`1`, or `2` with a CDN in front of the proxy).
- **The log says what to set.** At start, with https addresses, no name and no
  `TRUSTED_PROXY_HOPS`, the launcher says what the effect of leaving it is and when
  to set it (`proxyAdvice`).
- **The README says it**, and says what a trial is: the three ports are published
  on every address of the machine, and where others can reach it they go on
  `127.0.0.1`.

Chosen over only documenting the two variables: nobody set them. Chosen over
`production` for every installation: a trial on `localhost` has no TLS, so the
cookie would not be sent at all.

## Consequences

- An installation that was behind a proxy of its own over https now runs as
  `production` after an update: it refuses example secrets and Cloudflare's test
  captcha keys (it generates its own secrets, and the captcha is built in unless
  keys are given). One that gave test keys by hand has to give its own.
- The shared lockout stays until the owner sets `TRUSTED_PROXY_HOPS`, and says so in
  the log, where it is read. It is the safer way to be wrong: an attacker cannot
  turn it into a way round the limit.
