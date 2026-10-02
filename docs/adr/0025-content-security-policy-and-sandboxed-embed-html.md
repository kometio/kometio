# 0025 — Content-Security-Policy on public-site, `embed-html` sandboxed in an iframe

**Status**: Accepted — 2026-08-27

## Context

Security review 2026-08-24 flagged `apps/public-site` as having no
Content-Security-Policy on any real page route — only a narrow
`frame-ancestors` header on the editor's own live-preview route
(`src/pages/preview/[pageId].astro`), nothing on the actual published
pages a visitor loads. `apps/api` already sends a strict CSP via
`helmet`, but that only governs its own JSON responses, never anything a
browser actually renders as a document.

The obstacle to a strict `script-src` specifically: `embed-html`
(`EmbedHtml.astro`) is a deliberate product feature (confirmed with the
user, 2026-08-19) letting a site owner paste arbitrary third-party
HTML/JS — Google Analytics snippets, chat widgets, Calendly, anything —
sanitized only by stripping `on*` inline event-handler attributes
(`sanitize-html`, `allowedTags: false`). A `script-src` that blocks
inline/third-party scripts breaks that feature outright; leaving
`script-src` permissive to keep it working leaves the CSP unable to
mitigate script injection on any of the other 47 block types either,
which is the whole point of having one.

## Decision

### `embed-html` moves into a sandboxed `<iframe>`; the rest of the page gets a real, strict CSP

`EmbedHtml.astro` no longer injects the sanitized HTML directly into the
page's own DOM via `set:html`. It builds a full standalone HTML document
(the sanitized markup plus a small `ResizeObserver`-based height reporter,
see Consequences) and renders it as `<iframe sandbox="allow-scripts
allow-popups allow-popups-to-escape-sandbox allow-forms" srcdoc={...}>`.

**`allow-same-origin` is deliberately excluded** — the one sandbox token
that would undo the isolation. For a `srcdoc` iframe specifically,
`allow-same-origin` grants the _embedding page's own origin_, not a
freshly-opaque one; combined with `allow-scripts`, a malicious or
compromised third-party snippet would get full script access to the real
site's origin — cookies, `localStorage`, authenticated fetches — exactly
what the sandbox exists to prevent. Without it, the iframe's content runs
with a unique, cookie-less, storage-less origin regardless of what script
it runs.

A `srcdoc` iframe has no HTTP response of its own to carry a CSP header,
and by default _inherits_ the embedding document's CSP — which would
silently re-impose the strict policy this whole mechanism exists to
avoid for pasted content. Its `srcdoc` document opens with its own
`<meta http-equiv="Content-Security-Policy" content="default-src * data:
blob: 'unsafe-inline' 'unsafe-eval'; ...">`, which per spec overrides
inheritance for that specific nested document — the top-level page's
policy is untouched by it.

The rest of the page gets `content-security-policy.ts`'s
`buildContentSecurityPolicy(frameAncestors)`, applied by a new
`src/middleware.ts` for every route (`frame-ancestors 'self'` by
default; the preview route sets its own, `frame-ancestors
${editorAppUrl()}`, by setting the same header itself — the middleware
checks `response.headers.has(...)` first and only fills in the default
when nothing more specific was already set):

```
default-src 'self';
script-src 'self' https://challenges.cloudflare.com '<hash>';
style-src 'self' 'unsafe-inline' https:;
img-src 'self' data: https:;
font-src 'self' https: data:;
frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com;
connect-src 'self' https://challenges.cloudflare.com;
object-src 'none';
base-uri 'self';
frame-ancestors 'self';
upgrade-insecure-requests
```

Every non-default-source entry was found by grepping the actual block
components for real external resource usage, not assumed: Turnstile
(`Form.astro`/`NewsletterSignup.astro`, ADR 0020's anti-spam widget)
loads its script and challenge iframe from `challenges.cloudflare.com`
and needs `connect-src` for its own verification calls;
`VideoEmbed.astro`/`MapEmbed.astro` (via the shared
`ConsentGatedEmbed.astro`) only ever build an iframe `src` from one of
three fixed hosts — `youtube-nocookie.com`/`player.vimeo.com`/
`google.com` — normalized server-side from a validated user URL, never
an arbitrary one, so allow-listing exactly those three is safe.

### The one remaining `is:inline` script gets a hash, not a blanket allowance

`PromoBar.astro`'s dismiss-check must run synchronously before first
paint (avoiding a flash of an already-dismissed bar), which rules out
Astro's normal script bundling (deferred, `type="module"`). Its source
now lives in its own string constant
(`promo-bar-dismiss-script.ts`, `PROMO_BAR_DISMISS_SCRIPT`), rendered via
`<script is:inline set:html={PROMO_BAR_DISMISS_SCRIPT} />` — not
inlined directly as JSX text — specifically so `content-security-
policy.ts` can compute `sha256-<digest>` from that exact same string at
runtime and include it in `script-src`. A hash computed once by hand and
pasted into the policy would silently go stale the moment either file
was reformatted; deriving it from the shared constant means the two can
never drift apart. Verified empirically: extracted the actual rendered
`<script>` content from a live page response and recomputed its SHA-256
independently — it matched the CSP header's hash byte-for-byte.

## Consequences

- `embed-html`'s auto-height: since the pasted content now renders
  inside an iframe rather than flowing inline, its height must be
  reported back explicitly. A `ResizeObserver` inside the `srcdoc`
  document `postMessage`s `{ kometioEmbedHtmlHeight }` to the parent; a
  small bundled (not inline) script in `EmbedHtml.astro` listens for
  `message` events and matches `event.source` against each
  `.kometio-embed-html__frame` on the page (several can coexist) to set
  that one iframe's height. The iframe starts at a fixed 150px guess
  until the first resize report arrives.
- `sanitize-html`'s `on*`-attribute stripping stays in place as defense
  in depth even though the sandbox is now the primary boundary — a
  belt-and-suspenders choice, not redundant given how cheap it is.
- Not verified: actual CSP enforcement in a real browser (no browser
  automation tool available in the environment this was built in) —
  correctness of `frame-src` not blocking a `srcdoc` iframe specifically
  relies on documented browser behavior, not an empirical browser test.
- `apps/public-site` gains its first `src/middleware.ts` — previously,
  every response header was set ad hoc per-route (as the preview route
  still does for its own `frame-ancestors` override).
