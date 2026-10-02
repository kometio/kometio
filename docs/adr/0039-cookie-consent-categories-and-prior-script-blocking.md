# 0039 — Cookie consent: 4 categories, `<template>`-based prior blocking, first-party cookie

**Status**: Accepted — 2026-09-01

## Context

Kometio had no cookie-consent mechanism at all: `themeHeadScript`/
`themeBodyScript` (ADR-0021) inject a site owner's pasted analytics/
tracking snippets verbatim into every page, unconditionally, before any
visitor choice. This is a real GDPR gap for any site actually using
Google Analytics, GTM, or Meta Pixel through those fields — exactly the
"batch H, not built" cookie banner already called out in
`ConsentGatedEmbed.astro`'s own comment.

The user asked for something built "in stile iubenda" (iubenda being the
market leader in this space) — a bottom-bar banner, default accept button
on the left, above the footer, on every page — plus a stepper to generate
Privacy Policy / Cookie Policy / Terms & Conditions pages (that stepper is
covered by ADR-0040, not this one). Before building, iubenda's own product
was researched directly (its banner customization options, its 4 consent
categories, and its "prior blocking" script-neutralization mechanism) so
this feature matches what the market leader actually does, not a guess.

Three real forks were resolved with the project author before
implementation (this project's standing rule for architectural decisions):

## Decision

### 1. Four consent categories, matching iubenda: Necessary, Functionality, Measurement, Experience

`Necessary` is not a real toggle — a script tagged with it always runs,
the same trust tier as `themeHeadScript`/`themeBodyScript` already have.
The other three are real, independently toggleable categories a visitor
grants or withholds.

### 2. Categorized tracker scripts, not `type="text/plain"` — real `<template>`-based blocking

`themeHeadScript`/`themeBodyScript` are one opaque free-text blob each —
there is no way to gate part of a blob by category. A new structured list,
`Site.themeTrackerScripts` (`{id, label, category, placement, html}[]`,
same jsonb-on-`sites` pattern as `themeAllowedTrackerDomains`), is the
categorized alternative: each entry is one vendor snippet with one
category.

**Legacy free-text fields**: kept, non-breaking. Every save of
`PATCH /sites/:id/theme-settings`
(`update-site-theme-settings.use-case.ts`) runs a signature detector
(`tracker-signature-detector.ts`) against `themeHeadScript`/
`themeBodyScript`, recognizes GTM/GA4/Meta Pixel (the same 3 vendors
already hardcoded as CSP origins, content-security-policy.ts) by their
well-known script URL/global-function-call, and **automatically** moves a
recognized `<script>` tag out of the free-text field into a new
categorized `themeTrackerScripts` entry — the project author's own
framing: "il nostro GDPR dovrebbe vedere da solo quei blocchi". Anything
unrecognized (custom code, or a vendor the detector doesn't know) stays in
the free-text field, always executed as "necessary" — same behavior as
before this feature, not a breaking change to existing sites.

**Blocking technique**: each non-necessary entry is wrapped in an inert
`<template data-kometio-consent="{category}" data-kometio-id="{id}">…</template>`
(`consent-script-blocking.ts`) rather than the industry-standard
`type="text/plain"` rewrite. `<template>` content is parsed but never
executed _or fetched_ by the browser — this blocks a vendor's own
`<noscript>`/`<img>` fallback beacon too, not just its `<script>` tags,
which a `type="text/plain"` rewrite would miss. Kometio renders the page
itself (unlike a third-party snippet forced to patch the DOM after the
fact), so it can do strictly better than the technique third-party
consent-management platforms are stuck with.

Activation (`cookie-consent-bootstrap.ts`, an `is:inline` script in
`<head>`, nonce'd per-request like any other per-request inline script)
clones a matching template's content and inserts it into the live
document once its category is granted — this is what makes the cloned
`<script>` execute (DOM-API insertion runs scripts; `<template>` parsing
never does). The activation code sets each cloned script's `.nonce`
property explicitly from a literal embedded in the bootstrap script's own
source, rather than relying on the nonce surviving inside the inert
template's own markup — a real nonce baked into inert content gets
scrubbed by the browser at parse time regardless (nonce-hiding, meant to
stop XSS from reading a valid nonce off the page and reusing it), and
whether that hidden value survives `cloneNode()` is inconsistent enough
across engines that real consent-management platforms don't rely on it
either.

CSP needs no new directive for this: a script inside an unactivated
`<template>` isn't fetched or executed, so it's irrelevant to `script-src`
until activation supplies a real nonce.

### 3. First-party cookie, not localStorage

`kometio_consent` (`{v, id, ts, cats}`, 6 months, `SameSite=Lax; Secure`).
GDPR expects consent to be demonstrable — a cookie carries an id and
timestamp the server can read (a later iteration could SSR-skip the
banner or gate server-rendered content on it), and it's the mechanism a
DPO/auditor expects to find. `localStorage` (the pattern `PromoBar`'s own
dismiss-check already uses) is simpler but invisible server-side and more
easily cleared in some contexts.

### Banner rendering: a site-wide global, not a block

The banner (`CookieConsent.astro`) is rendered directly by
`PageLayout.astro` — in **both** the core file and its
`themes/docs-showcase` override (there is no shared base between them,
confirmed: the docs-showcase file is a full byte-copied override resolved
via `resolve-theme-layout-override.ts`'s `import.meta.glob`, so this is
two edits, not one) — deliberately **outside** the editable block tree.

> **Amended 2026-09-04.** The full-shell override described above is gone:
> a theme now supplies at most a narrow `regions/*.astro` fragment and can
> no longer render (or forget to render) the banner at all. It is one edit
> now, in core's `PageLayout.astro` alone. See `themes/README.md`.

Unlike `BackToTop`/`WhatsAppButton`/`PromoBar` (all regular
`block-registry` blocks an editor must place), the banner must be
guaranteed present on every page: an editor forgetting to drag it onto a
header/footer is not an acceptable failure mode for a legal-compliance
UI. Default: bottom bar, accept button on the left, above the footer,
with a reopen tab (bottom-left by default) once a choice is made — all
configurable in editor-app's new "Cookie banner" page
(`_shell.cookies.index.tsx`), gated behind `cookieBannerSettings.enabled`
(defaults `false`, so no existing site gains a banner it didn't ask for).

## Consequences

- A real, working "prior blocking" mechanism exists where none did —
  closes a genuine GDPR gap, not just a cosmetic banner.
- The automatic-detection behavior means an admin who already has GTM/
  GA4/Meta Pixel pasted into Integrations gets it categorized and gated
  the next time they save that page, with no separate migration step.
- Deliberately deferred to a v1 follow-up (documented, not forgotten):
  a server-side consent ledger (the cookie is the only record in v1);
  `EmbedHtml` per-block consent gating and `ConsentGatedEmbed` auto-load
  on `experience` consent (both real, both cleanly separable); legacy
  scripts using `document.write` won't survive activation post-load
  (rare in modern vendor snippets, a known limitation of the DOM-insertion
  activation technique itself, not specific to this implementation).
- Two pre-existing bugs on this exact code path were found and fixed
  first, separately: `themeHeadScript`/`themeBodyScript` were being
  nulled whenever `themeOverridesEnabled` was off (ADR-0031 already said
  trackers shouldn't depend on that toggle), and `themes/docs-showcase`'s
  `PageLayout.astro` never nonce-stamped injected scripts at all under
  the strict CSP (ADR-0025) — silently blocking every pasted snippet on
  that theme.
