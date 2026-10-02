# 0021 — Site theming: filesystem theme packages + DB-backed style settings

**Status**: Accepted — 2026-08-20

## Context

`piano-progetto-astro-cms.md` left two related questions explicitly open:
point 6 ("Gestione temi/template" — what a "theme" even means here, not
decided) and point 7 (Core/App separation, Bedrock/Sage-inspired — how an
agency's customizations for one client survive a Kometio core update,
blocking Phase 7 but not blocking Phase 0-6). Point 7 had concluded there
was nothing to decide yet, because no "app" content existed to separate
from "core" — every line of code in the repo was Kometio itself. This ADR
is the first case where that stops being true: a per-site color panel is
squarely "core" (it's product functionality every deployment gets), but
"let an agency rewrite the frontend for one client" is squarely the "app"
concern point 7 was reserving.

Raised by the user directly: without deep customization freedom for the
dev/agency building a client's site, the product loses its wedge — an
agency that can't make a site look distinctly like _their_ work, not a
generic template, won't adopt it.

## Decision

### Two tiers, matching the plan's own "progressive disclosure" principle

- **Tier 1 — site-level style settings, DB-backed.** A new
  `Site.updateThemeSettings()` (same per-concern grouping already used for
  `updateBusinessInfo`/`updateSeoSettings`/etc.) holding discrete typed
  columns — primary/secondary color, font choice (curated list, with a
  free-text "custom Google Fonts name" escape hatch — the user asked for
  both rather than picking one), custom CSS, custom head/body scripts,
  favicon, plus a master `overridesEnabled` switch (see the two-gate
  section below). Editable live via a new editor-app settings dialog, no
  rebuild. Rendered into `PageLayout.astro`'s `<head>` as CSS custom
  properties, a raw `<style>` block for the custom CSS, and verbatim
  `<script>` tags for the custom scripts. No sanitization or CSP: this
  project has no CSP anywhere today, and whoever has access to Site
  settings already has equal or greater reach by editing pages/blocks
  directly — this feature doesn't lower an existing trust boundary.
- **Tier 2 — filesystem theme packages.** This is the concrete answer to
  point 7 for the theming case specifically: a theme is a directory
  outside the existing Nx `apps`/`libs`, not a new Nx project. A normal Nx
  project still compiles into the same build graph and ships in the same
  Docker image — it doesn't give the actual property Bedrock/Sage
  provides (an agency's own folder that a core update never touches).
  Selected per-deployment via a build-time env var (`KOMETIO_THEME`), never
  swapped at runtime — consistent with the plan's own non-negotiable
  "Docker image is the unit of distribution, not FTP-style files":
  changing a site's theme means a rebuild/redeploy, the same cost as
  every other deployment-level config change in this product.

### A theme is a complete, self-sufficient package — not partial overrides on a default

```
themes/
  classic/           # ships with core
  docs-showcase/      # ships with core
  shop-showcase/       # ships with core
  portfolio/           # ships with core
  <agency-name>/         # written from scratch by an agency, same shape
    theme.css            # design tokens (the common case, see below)
    theme.json            # { "allowStyleOverrides": boolean }, defaults true
    blocks/*.astro          # optional, full-file escalation past tokens
    PageLayout.astro          # optional, same
```

Considered a Bedrock-style partial-override convention (an agency's file
wins over core's file of the same name, everything else falls back to a
shared default) and rejected it **as the primary mechanism**: it's a more
complex resolution story to build and reason about than the actual
day-to-day case needs. In practice a theme's identity is carried mostly
by one thing: a **design-token file** (`theme.css` — colors, fonts,
spacing, radii, shadows, expressed as Tailwind `@theme`/CSS custom
properties) plus `PageLayout.astro`. Every block component reads those
tokens (`bg-primary`, `text-foreground`, etc.) rather than hardcoded
values, the same way shadcn/ui itself is "themed" — one shared set of
components, restyled entirely by swapping which tokens are in scope, not
duplicated per theme. A theme package that ships only `theme.css` +
`PageLayout.astro` already looks completely different while every block
underneath is still core's shared implementation — this is what "self-
sufficient" means for the common case, not "must duplicate all 30+ block
files to exist."

Full-file replacement remains available, not excluded — a theme wanting
to go further than tokens can (a genuinely different `Hero.astro`, a
custom Puck block registration); when present, the theme's own file wins
over core's, resolved at build time. What's rejected is _silent, partial,
file-by-file_ fallback as the mental model for every block by default —
a theme is "complete" in the sense that its tokens + layout fully
determine the shared blocks' appearance without any file duplication,
and any file it additionally ships is a deliberate, explicit escalation
past that default, not an implicit gap-filling convention to reason
about file-by-file.

### Four themes ship with core, at this decision's date

1. **`classic`** — flat, minimal, general-purpose "sito vetrina" style,
   for the product's primary target (restaurants, professionals, small
   businesses). Direction taken from the user's own `ellevas.dev` as a
   reference point for restraint, generous whitespace, and clean
   typographic hierarchy — **not** a literal copy of its dark/monospace
   developer-portfolio palette, which fits a personal technical brand,
   not a general small-business site. Flagged explicitly here as an
   interpretation to confirm when this theme is actually designed, not a
   literal instruction already agreed in full.
2. **`docs-showcase`** — built for technical documentation and product
   showcase pages. This is the theme Kometio's own product website will be
   built with — the flagship, dogfooded example of the product, not a
   demo theme kept separate from what ships to real users.
3. **`shop-showcase`** — a showcase storefront: products on display, no
   cart/checkout/payment. Feeds directly into Phase 8's Catalog feature
   (`piano-progetto-astro-cms.md` point 8 — "solo esposizione, non
   vendita"), and is expected to be the theme that exercises the Catalog
   blocks (Griglia prodotti, Prodotti correlati) most directly once that
   phase exists.
4. **`portfolio`** — added after the first pass at this list: a literal,
   direct expression of the user's own `ellevas.dev` (dark background,
   monospace/terminal accents), unlike `classic`'s adapted-in-principle
   take on the same reference. For a personal technical portfolio, not a
   general-business site — the two themes deliberately diverge from the
   same starting point rather than one trying to serve both audiences.

None of the four has any privileged status in the mechanism beyond being
maintained and shipped by Kometio itself — an agency's own theme, written
from scratch, is a peer, not a second-class citizen bolted on top.

### Two-gate override composition: the theme has final say, the site has day-to-day say

Building Tier 1 surfaced a real gap in the design above: nothing stopped
a client's saved panel edits from silently bleeding into a _different_
theme later — an agency deploys `KOMETIO_THEME=my-bespoke-theme` for a
client who previously had `classic` with a custom primary color saved,
and that stale color would still apply, `!important`, to a design the
agency wants to be authoritative. Raised directly by the user: "io
potrei anche non voler passare dal pannello stile e usare direttamente
il mio tema" (I might not want to go through the style panel at all and
just use my own theme).

Two gates now compose, both required for any Tier 1 field to render:

1. **`theme.json`'s `allowStyleOverrides`** (Tier 2, filesystem, defaults
   `true`) — the theme author's own ceiling. A bespoke agency theme sets
   this `false` to make Tier 1 permanently inert for every site running
   it, full stop, regardless of what any site has saved or will save.
   Nothing at the site level can raise this ceiling back up.
2. **`Site.themeSettings.overridesEnabled`** (Tier 1, DB, defaults
   `true`, new `themeOverridesEnabled` column) — a master switch inside
   the Style dialog itself, _below_ that ceiling: "apply what I've saved
   here" vs. "temporarily show the theme's own look without losing what
   I've saved". Controlled by whoever edits Site settings, which is why
   it can't be the mechanism an agency relies on to protect _their own_
   design intent — the client who could accidentally flip theme.json's
   equivalent doesn't have filesystem/deploy access, but does have this
   toggle.

`PageLayout.astro` computes one effective `theme` object at the top of
the component (both gates ANDed together) and reads every Tier 1 field
through it, rather than checking both gates at each of the four usage
sites (colors, font, favicon, custom CSS/scripts) — one gate is harder to
accidentally miss than four scattered conditionals.

### Boundary: presentation is unlimited, the content model is not

A theme package can restyle or entirely rewrite anything in the rendering
layer — components, layout, CSS, client JS, even register new or rewritten
Puck blocks. It cannot introduce a new _data field_ on an existing block
without also extending that block's Zod schema, which lives in
`libs/puck-config` and stays core — the canonical `Block[]` content model
(ADR-0007) is shared infrastructure every theme renders, not something a
theme redefines for itself.

## Consequences

- Resolves `piano-progetto-astro-cms.md` points 6 and 7 — both to be
  updated to reference this ADR instead of "not yet decided". Unblocks
  Phase 7 (WordPress importer): migrated content lands as ordinary
  pages/data, never inside a theme package, so this decision doesn't
  constrain the importer's design, only removes the structural
  uncertainty that was blocking it from starting.
- **Implemented same-day**: Tier 1 (`sites.theme_*` columns, migration
  `0019`, `PATCH /sites/:id/theme-settings`, the Style dialog in
  editor-app), Tier 2's resolution mechanism (Vite `~theme` alias in
  `astro.config.mjs`, resolved from `KOMETIO_THEME`, default `classic`),
  Tailwind v4 + `@astrojs/react` on `apps/public-site`, and the `classic`
  theme itself (applied to `Hero.astro` as the mechanism's proof). The
  `themeOverridesEnabled` column (migration `0020`) and `theme.json`'s
  `allowStyleOverrides` shipped in the same pass as the two-gate
  composition above, not as a later fix.
- **Not yet built**: the `docs-showcase`, `shop-showcase`, and `portfolio`
  themes, and migrating the rest of the existing ~30 block components onto
  Tailwind tokens (only `Hero.astro` is done) — sequenced as follow-up
  work, not blocking this ADR.
- Found only by testing live in a browser, not by code review: Astro's
  dev server injects `import '*.css'` side-effect styles as their own
  `<style data-vite-dev-id>` tags positioned _after_ a component's own
  inline markup in the rendered HTML, regardless of import order in the
  frontmatter — an inline Tier 1 `<style>` block written later in
  `PageLayout.astro`'s template still lost the cascade to the theme's own
  `:root` rule. Fixed with `!important` on every Tier 1 declaration
  (`PageLayout.astro`'s own comment has the full account) — an explicit,
  order-independent "Tier 1 wins when both gates allow it," not a
  specificity workaround.
- Left open for future implementation work, deliberately not decided
  here: whether/how a theme registers custom Puck blocks and how those
  surface in `editor-app`; and a strategy for keeping four (and growing)
  themes from silently drifting out of sync when a core block's Zod
  schema changes underneath them.

## Amendment — 2026-09-02: themes become real Nx/pnpm packages

[ADR-0041](0041-theme-defined-block-extensions.md) resolved the first
open item above — a theme can now register a genuinely new block type —
and along the way partially reversed this ADR's own original stance
that "a theme is a directory outside the existing Nx `apps`/`libs`, not
a new Nx project." `themes/classic` and `themes/docs-showcase` are now
real Nx/pnpm packages (`@kometio/theme-classic`/`@kometio/theme-docs-showcase`,
`nx.tags: ["app"]`), each with a real `typecheck`/`lint`/`test` target
that runs in CI. Worth being explicit about why, and what it does and
doesn't change:

- Before this, a theme's own files were **completely invisible** to any
  correctness tooling — `astro check`'s `include` doesn't reach them,
  and a file only ever matched by `import.meta.glob` is never opened by
  `tsc` at all. A real bug in a theme's code (wrong prop type, a typo'd
  i18n key, a business-rule violation) could only ever be discovered by
  a human clicking around, or by a real user hitting a 500. Making
  themes real Nx packages closes that for real: `tsc` type-checks them,
  and each theme's own `blocks/blocks.spec.ts` — only possible because
  it's now a real `test` target — is what actually, reliably keeps a
  broken block or a core-type collision from ever shipping.
- **This benefit currently reaches every theme that can possibly
  exist** — as of this amendment there is still no self-hosting
  distribution mechanism (Dockerfile, build pipeline, or any way to
  layer an externally-hosted theme into a build at all — see the
  backlog). Until that's built, the _only_ way for any theme, first-party
  or hypothetically third-party, to exist at all is to physically live
  under this repo's own `themes/` directory. So today, "does this
  exclude a third party from the benefit" is a moot question — nothing
  exists outside this repo's `themes/` to exclude.
- That's also exactly where the earlier isolation intent (this ADR's
  "Tier 2" reasoning, Bedrock/Sage-style: an agency's own folder a core
  update never touches) becomes a real, unresolved question again, not
  before: a theme inside this Nx workspace depends on `@kometio/block-sdk`/
  `@kometio/shared-types` via `workspace:*`, so a shape change to either
  in a future release would fail a first-party theme's typecheck
  immediately on the next install — which is the _right_ outcome for
  Kometio's own team (loud, at build time, not a silent runtime surprise),
  but is precisely the coupling this ADR's Tier 2 design set out to
  avoid for a genuinely external theme author. Whether a future
  self-hosting distribution model keeps themes inside this same Nx
  workspace, or instead layers in an externally-repo'd theme at Docker
  build time (git submodule, build-context `COPY`, or similar — in
  which case that theme would need its own independent scaffolding
  against a published `@kometio/block-sdk` npm version, not
  `workspace:*`) is **explicitly not decided by this amendment**,
  deferred until Phase 6 (self-hosting distribution) exists to test it
  against a real, deliberately disconnected theme built the way an
  actual external developer would build one.

## Amendment — 2026-09-02: Tier 2 becomes runtime-selectable for bundled themes

This ADR's original Decision section states Tier 2 (filesystem theme
packages) is "[s]elected per-deployment via a build-time env var
(`KOMETIO_THEME`), never swapped at runtime." [ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md)
changes that specific claim: a self-hosted deployment's image now bundles
every theme under `themes/*` at build time, and which one a given site
actually renders becomes a runtime, DB-backed choice (`Site.themeName`),
picked from an editor-app menu with zero rebuild. See ADR-0042 itself for
the full design and [docs/adr/0032](0032-one-container-per-site-deployment-unit.md)'s
own 2026-09-02 amendment for why this doesn't reopen the multi-tenancy
question this ADR's Tier 2 reasoning was never about. Uploading a
genuinely new, uninstalled theme still requires a rebuild — only
switching among an already-bundled set is instant.

## Amendment — 2026-09-07: the two gates stop being one

Tier 1 is guarded by two switches, and they had been fused into a single
`&&` used for everything the site puts on top of the theme:

```ts
const allowStyleOverrides =
  (themeManifest.allowStyleOverrides ?? true) &&
  site.themeSettings.overridesEnabled;
```

They mean different things and are now separate.

**`themeManifest.allowStyleOverrides`** is the THEME author's ceiling:
"no site may dress me". It covers everything a site adds on top — Tier 1
tokens, per-type block styles, per-instance block styles. A rule honoured
by two tiers out of three is not a ceiling.

**`site.themeSettings.overridesEnabled`** is the SITE's own day-to-day
switch, and it covers **Tier 1 only**.

### Why the narrower scope is the correction, not a change of mind

The control has said so from the beginning. It lives in the Style
settings page; it greys out (`inert`) exactly the five fields beside it —
primary colour, secondary colour, font, custom CSS, favicon — and its own
description reads _"every field below is ignored"_. Block styles are not
below it. They are not in that page at all: per-type styles are edited in
the Global Styles dialog and on the block's own toolbar, per-instance
ones in a popover on the selected block.

The renderer went further than the control promised. The line dates from
the commit that introduced the global styles editor (21 August 2026), and
the reasoning is visible in the comment it carried: _"The Global Styles
Editor — the same gate as above"_. Both did come out of a dialog called
"styles", so one gate looked right at the time.

What it produced was upside down. On a site with the switch off, an
agency could restyle **one** block on **one** page — that tier was never
gated, because it was an inline `style` attribute then and this gate
decides what CSS the layout emits — but could not restyle **every** block
of a type. The smaller power allowed, the larger one refused, and nothing
anywhere said why.

### Consequences

- A site with `overridesEnabled` off now shows its per-type and
  per-variant block styles again. Nothing else about it changes: its
  Tier 1 tokens stay suppressed, which is what the switch is for.
- A theme with `allowStyleOverrides: false` now suppresses per-instance
  styles too, which it did not before. No bundled theme sets it, so this
  changes nothing today; it makes the ceiling true for the first theme
  that uses it.
- The editor now reads the ceiling and stops offering what the theme
  refuses — see the follow-up below.

## Follow-up — 2026-09-07: the editor can finally read the ceiling

The amendment above left one thing open, and it was the older half of the
problem rather than anything it introduced: **the editor could not see
`allowStyleOverrides` at all.**

None of the five theme endpoints
(`icons`, `block-style-defaults`, `foreground-tokens`, `base-tokens`,
`blocks`) served the manifest, so a site running a theme that refused to
be dressed still showed every styling control, saved what the client
chose, and published a page that ignored it. The Style page's own switch
admitted as much in its description: _"the active theme can also lock this
off entirely — see its own documentation"_. Telling someone to go and read
a theme's documentation is what a control says when it cannot answer.

`GET /api/themes/current/capabilities` now answers it, returning the one
resolved flag rather than the manifest wholesale — `stickyFooter` is
core's rendering business and means nothing to the editor, and a manifest
served whole is where a private field eventually leaks into a public
response by accident.

Three surfaces read it: the block toolbar (both styling buttons
disappear), the Global Styles dialog (a sentence instead of an empty
list), and the Style settings page (a note, and the Tier 1 fields turn
`inert` regardless of the site's own switch).

The variant picker stays, and that is not an oversight: a variant is a
look the THEME declares (ADR-0047), so choosing between them is picking
from the theme's own vocabulary rather than a site putting its own
presentation on top. What the ceiling refuses is the site's per-variant
STYLE — the theme's own variant CSS still applies.

Two things worth keeping:

- **Unknown means allowed.** While the answer is in flight the editor
  behaves as if styling is permitted. The alternative flickers every
  control off and back on for every user of every theme, to spare the one
  case where a theme forbids it: a control shown a moment too long costs a
  click, a control hidden for a moment costs trust in the tool.
- Gating the block toolbar's `stylableProperties` was not enough on its
  own. `marginTop`/`marginBottom` are appended to that list _afterwards_
  for a root-level block, so the per-instance button survived on a theme
  that refuses everything. The test caught it; reading the code had not.
