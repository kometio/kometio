# @kometio/public-site

The public-facing site: server-rendered Astro (`output: 'server'`,
`@astrojs/node`), no React/editor-library dependency — see
[ADR-0012](../../docs/adr/0012-public-site-rendering-via-dedicated-api-endpoint.md)
for why, and `docs/development.md` for how to run it locally alongside
`apps/api`.

## How a request is served

1. Every locale gets an explicit URL prefix, including the default one —
   `src/pages/[locale]/[...slug].astro` (or `src/pages/[locale]/index.astro`
   for `/it/`) resolves the site from the request's `Host` header and calls
   `apps/api`'s public, unauthenticated `GET /public/pages/by-slug`
   (`src/lib/public-api-client.ts`) with the URL's locale. The bare `/`
   (`src/pages/index.ts`) has no page of its own — it 302s to
   `/${site.defaultLocale}/`. There's also a dedicated
   `src/pages/[locale]/search.astro`. See
   [ADR-0017](../../docs/adr/0017-multilingua-locale-prefixed-urls-and-page-translations.md)
   for the full multi-language design (per-site fallback behavior for an
   untranslated locale/slug, canonical-URL redirects for nested pages, the
   language switcher).
2. A page that isn't published, or doesn't exist, both 404 identically —
   see `src/components/NotFound.astro` and top-level `src/pages/404.astro`/
   `500.astro`.
3. A published page's `Block[]` content is walked directly by
   `src/components/BlockRenderer.astro` (via `PublicPageContent.astro`) and
   rendered with native `.astro` components (`src/components/blocks/`) — no
   third-party editor library involved, see
   [ADR-0007](../../docs/adr/0007-nested-block-content-model-independent-of-puck.md).
   Each block's prop shape is validated at render time
   (`heroPropsSchema.parse(block.props)`, etc.) against the same
   `@kometio/shared-types` Zod schema whose inferred TypeScript type
   (`HeroProps`, ...) `@kometio/block-registry`'s field descriptors are typed
   against in the editor, so the two can never silently drift apart.
   `locale`/`translations`/`site`/`ancestors`/`currentPageTitle` are threaded
   through every recursive `BlockRenderer` call (not re-fetched per block) so
   that nested blocks like `LanguageSwitcher` or `Breadcrumb` — which can sit
   inside a `Nav` — still have what they need. Response shapes themselves
   (`PublishedPage`, `PublishedSite`, ...) are shared Zod schemas from
   `@kometio/shared-types`, parsed at the network boundary instead of just
   cast — see
   [ADR-0026](../../docs/adr/0026-shared-zod-schemas-for-api-response-shapes.md).
4. A second, editor-only route (`src/pages/preview/[pageId].astro`) renders
   an unpublished draft behind a short-lived, stateless signed token
   (`?token=...`, see
   [ADR-0024](../../docs/adr/0024-stateless-signed-preview-tokens.md)) with
   `data-kometio-block-id`/`data-kometio-field` attributes and a small client
   script (`src/lib/preview-bridge-client.ts`) — this is what
   `apps/editor-app`'s canvas embeds in an `<iframe>` and drives via
   `postMessage` instead of re-implementing block rendering in React.

### Security: CSP and sandboxed `embed-html`

Every route gets a strict Content-Security-Policy via `src/middleware.ts`
(`frame-ancestors 'self'` by default; the preview route overrides it to the
editor-app's own origin). The `EmbedHtml` block — which deliberately allows
pasting arbitrary third-party HTML/JS (analytics, chat widgets, ...) — can't
be reconciled with a strict `script-src`, so it renders into a sandboxed
`<iframe srcdoc>` (`allow-scripts` but never `allow-same-origin`) with its
own permissive CSP scoped to just that nested document. See
[ADR-0025](../../docs/adr/0025-content-security-policy-and-sandboxed-embed-html.md)
for the full reasoning, including the one `is:inline` script (`PromoBar`'s
pre-paint dismiss check) that gets a CSP hash instead of a blanket allowance.

### UI-chrome translation (distinct from page-content translation)

`src/lib/i18n.ts` exports a `Translator` class (`new Translator(locale)`,
falls back to the base language subtag then to a default locale, never
throws on an unknown one) used by the ~18 "service" blocks that render fixed
UI copy regardless of a page's own content (`Countdown`, `Form`,
`SearchBox`, `PromoBar`, `BackToTop`, `WhatsAppButton`, `NewsletterSignup`,
...). This is unrelated to the per-page content translation system
(ADR-0017 above) — one instance per rendering component, not a bare
exported `t()` function.

## Commands (via Nx from the repo root)

```sh
pnpm exec nx run @kometio/public-site:dev         # dev server, http://localhost:4321
pnpm exec nx run @kometio/public-site:build       # production build (SSR, @astrojs/node)
pnpm exec nx run @kometio/public-site:start       # run the production build (node server.mjs)
pnpm exec nx run @kometio/public-site:typecheck   # astro check
pnpm exec nx run @kometio/public-site:test        # vitest
pnpm exec nx run @kometio/public-site:lint        # eslint
```

Needs `apps/api` running and `API_URL` pointing at it (see `.env.example`)
— there is no build-time list of pages to prerender, content is fetched
per-request.

### Production entrypoint is `server.mjs`, not `dist/server/entry.mjs`

The adapter (`astro.config.mjs`) is configured with `mode: 'middleware'`, so
the build output only exports a request handler — it doesn't start a server
or serve static files by itself. `server.mjs` wraps that handler with its
own static file serving (`sirv`) so it can add
`Access-Control-Allow-Origin` to the `_astro/*` asset bundles: the canvas
editor's live-preview iframe is sandboxed without `allow-same-origin`,
giving it an opaque origin, so every module/CSS request it makes needs a
CORS check even against this same host. `@astrojs/node`'s default
`standalone` mode serves those files before any Astro middleware ever sees
the request, so that header can't be added from within Astro itself —
hence the custom entrypoint.
