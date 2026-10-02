# 0076 — The editor reads its addresses when it starts, not when it was built

**Status**: Accepted — 2026-09-23

## Context

The editor is a static bundle. Two of the values it needs are addresses in
the browser's own world: where the API answers, and where the public site
serves the preview the canvas embeds. Both arrived through Vite's
`import.meta.env`, which means they were compiled into the JavaScript, and
both also appeared inside the `Content-Security-Policy` in `index.html`,
substituted at build time.

So the image and the domain were welded together. ADR-0042 accepted that
("changing a deployment's domain after initial setup means rebuilding that
one image"), and ADR-0044 narrowed it to these two values while calling the
runtime version "the natural next step, deliberately not taken here".

What makes it more than an inconvenience is ADR-0042's other decision:
published images are the distribution path. `docker-build.yml` passes no
build arguments, so the `editor-app` image on the registry carries the
Dockerfile's defaults — `http://localhost:3000/api` and
`http://localhost:4322`. Anyone pulling it gets an editor that talks to
their own laptop. The only working path was building locally, which is what
`docker-compose.prod.yml` did, and that quietly turns "pull and run" into
"clone, build, keep the toolchain".

## Decision

### The container writes the addresses, the browser reads them

`/config.js` sets `window.__KOMETIO_CONFIG__` and is loaded before the
bundle. In the image, an entrypoint script writes it at every start from
`KOMETIO_API_URL` and `KOMETIO_PUBLIC_SITE_URL`. `runtime-config.ts` reads it,
and falls back to the build-time value when the file set nothing — a
`dist/` served by some other static host, or a container started without
the variables, still works with whatever it was built against.

A placeholder that `envsubst` never replaced (`${KOMETIO_API_URL}` arriving
literally) counts as unset. The alternative is that string reaching
`fetch`, and a failure that points nowhere near its cause.

The file is served with `Cache-Control: no-store`. It is the one file whose
content depends on the environment rather than on the build, so a restart
with a new address has to reach the browser on the next load.

### The policy becomes a header

The `Content-Security-Policy` moves out of the `<meta>` tag into an nginx
header, built by the image's own `envsubst` pass over
`nginx.conf.template`. A meta tag could only carry what the build knew,
which is the thing being removed; rewriting the built HTML at every start
would work but means editing a shipped artefact in place. The header also
carries `frame-ancestors 'none'`, which a meta tag cannot express at all —
the editor is never meant to be embedded, unlike the pages inside its
canvas.

`NGINX_ENVSUBST_FILTER=^KOMETIO_` keeps that substitution to our own names,
so nginx's `$uri` and friends survive it.

The dev server keeps a `<meta>` policy of its own, injected by
`vite.config.mts`. Losing CSP while developing would mean a violation first
appearing in production, which is exactly backwards.

### What stays a build input

`VITE_TURNSTILE_SITE_KEY`: it has no runtime half here, and a wrong captcha
key fails visibly at the login screen rather than silently.

## Consequences

- One published image serves any domain. `docker compose up -d editor-app`
  after an address change is enough; nothing is rebuilt.
- `docker-compose.prod.yml` stops passing the two addresses as build
  arguments and passes them as environment instead, which is also what
  makes the compose file work against a pulled image rather than only a
  locally built one.
- The built `index.html` carries no CSP. A `dist/` served by a static host
  that sets no headers therefore has none — the container sets it, and so
  does the dev server, but a hand-rolled deployment has to.
- Two addresses now exist in two shapes (`KOMETIO_*` at runtime, `VITE_*` at
  build). The fallback order is written in one place, `runtime-config.ts`,
  and tested there.
- The next value that turns out to be deployment-specific has somewhere
  obvious to go, which is the part ADR-0044 was pointing at.
