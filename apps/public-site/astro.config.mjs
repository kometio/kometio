// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// docs/adr/0021's original two-tier theming model paired Tier 2 (which
// filesystem theme package) with a single build-time `~theme` Vite alias,
// on the assumption (then correct, per ADR-0032's "one container per
// site") that a container never needs to pick a theme per request. That
// assumption is amended by docs/adr/0042: every theme under themes/*
// bundles into this same image, and `Site.themeName` (DB-backed) picks
// which one a given request renders — see theme-registry.ts and every
// resolve-theme-*.ts file, which glob `../../../../themes/*/...` (every
// bundled theme) instead of a single aliased directory. `KOMETIO_THEME`
// still exists, but only as an optional, comma-separated allow-list read
// at *runtime* by theme-registry.ts's `applyThemeAllowList` — it narrows
// which of the bundled themes a deployment will serve at all, never which
// one a given site renders. Pruning themes/ on disk before this build was
// tried first and abandoned (see apps/public-site/Dockerfile for why it
// cannot work); either way the glob's pattern has to be a static literal,
// so it can't read an env var itself, and this file needs to know nothing
// about it. The deployment unit is still one container
// per site, unchanged (docs/adr/0032's own 2026-09-02 amendment); only
// *which theme* that one site uses is no longer fixed at image build.

// https://astro.build/config
export default defineConfig({
  // Server output: page content lives in Postgres, fetched per-request from
  // apps/api (see src/lib/public-api-client.ts) — there is no fixed set of
  // pages to know about at build time.
  output: 'server',
  adapter: node({
    // Middleware (not standalone): the sandboxed canvas iframe's opaque
    // origin needs Access-Control-Allow-Origin on the static asset bundles
    // under `_astro/` (see the CORS comment below) — standalone's built-in
    // static file server runs before any Astro middleware ever sees the
    // request, so it can't add that header. `server.mjs` (the real
    // production entrypoint, not `dist/server/entry.mjs` directly) wraps
    // this exported handler with its own static serving via `sirv` instead.
    mode: 'middleware',
  }),
  // Available to any theme (docs/adr/0021), not used by core's own blocks:
  // ADR-0019's "no framework" precedent stays the default for blocks we
  // ship, but nothing stops a theme author from dropping a .tsx component
  // and hydrating it with a client: directive — Astro islands mean it costs
  // nothing on a page that never uses one.
  integrations: [react()],
  image: {
    // Which remote images may be optimised is decided at RUNTIME, by our
    // own endpoint (src/image-endpoint.ts): only this site's media, under
    // API_PUBLIC_URL/uploads or S3_MEDIA_PUBLIC_BASE_URL — values that
    // differ per deployment while the image is one, so they cannot be
    // pinned here. The patterns stay open only so Astro hands every remote
    // source to that endpoint; the endpoint refuses what is not media.
    // Open patterns alone let anyone make this server fetch any address,
    // from inside its network (docs/adr/0038, amended).
    endpoint: { route: '/_image', entrypoint: './src/image-endpoint.ts' },
    remotePatterns: [{ protocol: 'https' }, { protocol: 'http' }],
  },
  vite: {
    plugins: [
      tailwindcss(),
      {
        // The editor's canvas (apps/editor-app/canvas-frame.tsx) loads this
        // page in a sandboxed iframe WITHOUT allow-same-origin (the fix for
        // stored XSS via untrusted user blocks) — its origin is therefore
        // opaque, and the browser treats EVERY request it makes, even to
        // this same host, as cross-origin. This header
        // stays necessary but is NOT enough on its own in dev: Astro's dev
        // server (>= 6.0) blocks these requests with a hard 403 before this
        // header ever counts, because `Origin: null` (an opaque origin)
        // never passes its internal validation — see "Canvas rendering
        // needs public-site's production build" in docs/development.md for
        // the full explanation and the workaround (build + `server.mjs`
        // instead of `nx serve` when working on the canvas). The equivalent
        // for the production build (static assets under `_astro/`, served
        // by `sirv` rather than Vite, where Astro's block does not exist)
        // lives in `server.mjs`, not here.
        // /api/* is explicitly excluded: render-block-fragment.ts does its
        // own CORS scoping against EDITOR_APP_URL (see the `cors: false`
        // comment below) and must never be overwritten here.
        name: 'kometio-dev-sandboxed-iframe-cors',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith('/api/')) {
              res.setHeader('Access-Control-Allow-Origin', '*');
            }
            next();
          });
        },
      },
    ],
    server: {
      // Il dev server di Vite intercetta ogni preflight OPTIONS con la
      // own generic CORS response, before it ever reaches the
      // rotta Astro — impedirebbe a render-block-fragment.ts's export
      // OPTIONS/i suoi header CORS scoped a EDITOR_APP_URL di funzionare
      // in dev (in production this does not exist at all: the standalone
      // Node adapter never goes through Vite). Disabled like this, the
      // rotta stessa a rispondere, identico tra dev e produzione.
      cors: false,
    },
  },
});
