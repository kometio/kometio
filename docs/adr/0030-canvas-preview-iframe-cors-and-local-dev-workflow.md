# 0030 — Canvas preview iframe CORS, and why local canvas testing needs public-site's production build

**Status**: Accepted — 2026-08-29

## Context

The canvas editor's live-preview `<iframe>` (`apps/editor-app/src/app/canvas/canvas-frame.tsx`) is sandboxed `allow-scripts allow-forms`, deliberately **without** `allow-same-origin` — a fix against stored XSS via untrusted user-inserted blocks/scripts (the iframe renders real, user-authored content). Without `allow-same-origin` the iframe gets an opaque origin (`Origin: null`), and per spec every `type="module"` script/CSS fetch it makes — even to this same host — requires a CORS check.

Reported 2026-08-29: the canvas bridge was completely broken (no hover/selection outline, no toolbar, inserted blocks invisible until reload, drag-to-reorder not working). Root cause traced to that opaque origin: `apps/public-site` sent no `Access-Control-Allow-Origin` on the JS/CSS bundles the sandboxed document loads, so the browser blocked `init-preview-bridge.ts` itself from ever loading — no bridge script, no `postMessage` handshake, none of the reported features could work. Confirmed reproducing in a real production build (`astro build` + running the built server directly), not just dev.

A second, unrelated bug surfaced while verifying the fix live in the browser: `editor-app`'s own CSP (`index.html`, a static `<meta>` tag) allowed `connect-src` only to `%API_ORIGIN%`, but `theme-api-client.ts` (icons/block-style-defaults/foreground-tokens) fetches `apps/public-site` directly from editor-app's own top document — public-site is the only app that knows the active theme (ADR-0021), so it can't go through `apps/api`. This was blocked by CSP regardless of the CORS fix, on every port.

A third, deeper issue surfaced only when testing against `nx serve @kometio/public-site` (Astro's dev server) instead of a production build: Astro's dev server (since v6.0; this project is on 7.2.2) has its own hardcoded `secFetchMiddleware` (`vite-plugin-astro-server/sec-fetch.js`) that flatly blocks any subresource request whose `Sec-Fetch-Site` isn't `same-origin`/`same-site`/`none`, unless its `Origin` header validates against `security.allowedDomains`. The sandboxed iframe's `Origin` is the literal string `"null"` — `new URL("null")` always throws — so it can never pass that check, **regardless of `allowedDomains` configuration**. This is unconditional, dev-only Astro hardening with no documented opt-out for an opaque origin; it does not exist in a production build at all.

## Decision

### Production: `@astrojs/node` adapter switched from `standalone` to `middleware` mode, with a small custom `server.mjs`

In `standalone` mode, `@astrojs/node` serves static assets (`_astro/*`) via its own internal file server _before_ any Astro middleware ever sees the request — there is no way to attach `Access-Control-Allow-Origin` to those responses from inside Astro itself. Switching `astro.config.mjs`'s adapter to `mode: 'middleware'` makes the build export a plain request handler with no server/static-serving of its own; `apps/public-site/server.mjs` (the real production entrypoint now, not `dist/server/entry.mjs` directly) wraps that handler:

```js
const serveAssets = sirv('dist/client', { dev: false });
const server = createServer((req, res) => {
  if (req.url?.startsWith('/_astro/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  serveAssets(req, res, () => astroHandler(req, res));
});
```

`*` is scoped to `/_astro/*` only (not the whole response, not `/api/*`) — these are public, tenant-agnostic asset bundles with no user/tenant data, so a wildcard is safe. The response never reflects the request's `Origin: null` back instead: that's a known anti-pattern that would let _any_ sandboxed iframe on the internet read the response, not just this one. `apps/public-site/package.json` gained a `start` script (`node --env-file=../../.env server.mjs`) as the documented way to run this.

### `editor-app`'s CSP `connect-src` includes `%VITE_PUBLIC_SITE_URL%`, not just `frame-src`

`index.html`'s CSP now allows `connect-src 'self' %API_ORIGIN% %VITE_PUBLIC_SITE_URL% https://challenges.cloudflare.com` — the same substitution `frame-src` already used, extended to cover `theme-api-client.ts`'s direct fetches from the top document.

### Local canvas testing always runs public-site's production build, not `nx serve`

Astro's dev-server hardening has no config-based workaround for an opaque iframe origin (confirmed: reverting the CORS fix, adjusting `allowedDomains`, and disabling `checkOrigin` all leave the `secFetchMiddleware` 403 in place — it doesn't consult `checkOrigin` at all). The only two ways around it would be either weakening the iframe sandbox (reopens the stored-XSS hole this same sandbox exists to close) or monkey-patching Astro's internal Vite middleware stack at runtime (fragile against any Astro upgrade, no public API for it). Neither was acceptable.

Instead, `.env.example`'s `VITE_PUBLIC_SITE_URL` now defaults to `http://localhost:4322` (a production build, see `PUBLIC_SITE_PORT`) instead of `nx serve`'s `:4321`, and `docs/development.md` documents this as the standing local workflow, not an occasional workaround: build and keep `nx run @kometio/public-site:start` running the same way `api`/`editor-app` are kept running, rebuilding after every public-site change you want reflected in the canvas. `nx serve @kometio/public-site` on `:4321` remains the right tool for anything that doesn't go through the canvas iframe (styling a block, viewing a published page directly, live-reload while iterating on public-site itself) — the two can run side by side on their own ports.

## Consequences

- No live-reload for public-site while testing the canvas locally — every content/block change needs a rebuild (`nx run @kometio/public-site:build`) before it shows up in the canvas. Accepted as the cost of not weakening the sandbox and not depending on undocumented Astro internals.
- `VITE_PUBLIC_SITE_URL` now also drives the editor's "Visualizza pagina" link, since it's the same env var — that link opens the production build too, and can look stale until the next rebuild. Swap it to `:4321` locally if that link needs to always reflect unbuilt changes.
- `server.mjs` now owns static-file serving for `_astro/*` (via `sirv`) instead of `@astrojs/node`'s built-in static handler — a small, real maintenance surface this project didn't have before, in exchange for the one choke point that can add the CORS header at all.
- This is specific to Astro 7.2.2's dev server; if a future Astro upgrade adds a documented opt-out for opaque iframe origins in `secFetchMiddleware` (or an equivalent), the local-dev-workflow half of this decision should be revisited — the production-side fix (adapter mode + `server.mjs`) is independent of that and stays either way.
