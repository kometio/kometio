# 0041 — Theme-defined block extensions (the Extension Manifest)

**Status**: Accepted — 2026-09-02

## Context

`docs/adr/0037` deliberately scoped `libs/block-sdk` narrowly: a
validated `defineBlock()` factory that makes _authoring_ a
`BlockDescriptor` safer, explicitly **not** a way to add a new block
type without touching core files. Adding one still meant editing up to
4 places by hand — `libs/block-registry/src/lib/config.ts` (the
descriptor import plus two array entries, `pageBlocks` and
`pageBlockCategories`), `apps/public-site/src/components/BlockRenderer.astro`'s
`BLOCK_REGISTRY` dispatch table, and `apps/editor-app/src/locales/{en,it}.json`
for i18n — confirmed by tracing exactly what adding the `Heading` block
and the `Callout` SDK example each required.

The product owner's explicit position: nobody, including the Kometio team
itself for its own docs-showcase site, should have to touch the core
application to add or change a block. This is the "Extension Manifest"
ADR-0037 named and deferred — brought forward here, before launch,
because the team's own docs-showcase site has already been doing exactly
what this mechanism is meant to prevent (its 4 pure `.astro` overrides
under `themes/docs-showcase/` predate this ADR and stay unchanged — see
"What this does not change" below — but any genuinely new block type it
wanted required core edits until now).

Two real, verified gaps stood between "wants to feel this way" and "is
this way":

1. `themes/` was not a pnpm/Nx package. It had no `package.json`, no
   `project.json`, wasn't in `pnpm-workspace.yaml`'s `packages:` glob —
   completely invisible to `nx run-many` (typecheck/lint/test), and
   therefore to CI. `astro check`'s `include` doesn't reach it, and
   files only ever matched by `import.meta.glob` are never opened by
   `tsc` at all. A theme's own block file could have a real type error,
   or a business-rule bug like a missing i18n key, and nothing would
   ever catch it before a real user saw the failure.
2. `apps/editor-app` had no way to discover a theme's block types. It's
   a separate app/process from `apps/public-site` (the only app that
   knows the active theme — `~theme`, docs/adr/0021, build-time-only),
   reading only the static `pageBlocks`/`pageBlockCategories` exports
   from `@kometio/block-registry`.

A third, unrelated but real bug surfaced while tracing this: the
`Heading` block (added after `Callout`) was missing every i18n key in
both `en.json` and `it.json` — the block picker and Inspector were
silently showing raw keys (`blocks.heading.label`) as visible text, and
`libs/shared-types/src/lib/search-text.ts`'s `switch` had no `Heading`
case either, making its text invisible to on-site search. Nothing
mechanically caught either gap. Fixed directly (not part of this
mechanism), but it motivated two of this ADR's own regression tests
(`block-i18n-coverage.spec.ts`, `search-text.ts`'s
`BLOCKS_WITHOUT_SEARCHABLE_TEXT`) — proof the same class of bug can't
ship silently again, for core blocks or theme ones.

## Decision

### File convention: three files per new block, same folder as existing overrides

```
themes/<name>/blocks/
  Faq.block.ts        # descriptor + schema (defineBlock()) — presence = "this is a NEW type"
  Faq.astro             # render component — same convention pure overrides already use
  Faq.locales.json      # {"en": {...}, "it": {...}} — exactly what would sit under blocks.faq
```

An `.astro` file with no matching `.block.ts` stays a pure override of
an existing core type (unchanged, pre-existing mechanism — see
`resolve-theme-block-override.ts`). `Faq.block.ts` exports the
`defineBlock()` result as `default` (for the editor) and the raw Zod
schema as `export { fooPropsSchema as schema }` — `defineBlock()`
doesn't store the schema on the returned descriptor by design
(docs/adr/0037), and the render path needs it for its own `.parse()`
safety net.

Every label — the block's own and each field's/option's — is a literal
i18n key string (`'blocks.faq.label'`, `'blocks.faq.fields.question.fieldLabel'`),
the same convention `libs/block-registry`'s ~44 core blocks already use.
`validateThemeBlockSet()` (`libs/block-sdk/src/lib/validate-theme-blocks.ts`)
checks these strings are _exactly_ the key `${type}` (first character
lowercased) derives — not just that `.locales.json` has _some_ value at
the matching path. That second, weaker check alone would have missed
the exact `Heading`-style typo bug this ADR's own context section
describes; catching the string mismatch directly closes it for theme
blocks the same way `block-i18n-coverage.spec.ts` closes it for core
ones.

### Themes become real Nx/pnpm packages

`themes/*` was added to `pnpm-workspace.yaml`. Each theme
(`themes/classic`, `themes/docs-showcase`) got its own `package.json`
(`@kometio/theme-classic` / `@kometio/theme-docs-showcase`, `nx.tags:
["app"]`) plus the minimal `tsconfig.json`/`tsconfig.lib.json`/
`tsconfig.spec.json`/`eslint.config.mjs`/`vitest.config.mts` footprint
`libs/block-sdk` already had. Nx's inference plugin picks these up
automatically — `typecheck`/`lint`/`test` targets exist for the first
time, and therefore run in CI for the first time. Each theme has its own
`blocks/blocks.spec.ts`: globs its own `.block.ts`/`.astro`/`.locales.json`
files, runs `validateThemeBlockSet()`, asserts zero errors — this is
also, deliberately, the one place a **core-type collision** is checked
reliably: `libs/block-sdk` can't depend on `@kometio/block-registry` (the
opposite dependency direction from docs/adr/0037), but a theme package
can — themes are `"app"`-tagged, `block-registry` is `"domain"`, and
`"app"` may depend on `"domain"` — so each theme's own spec imports `pageBlocks`/
`headerFooterBlocks` directly and asserts no theme block's `type`
matches an existing core one. This runs unconditionally in CI, for
every theme, regardless of which one is the active `KOMETIO_THEME` — the
actual guarantee behind "a colliding type is a build failure", not a
probabilistic one. (`apps/public-site`'s own runtime check, at first
request for `/api/themes/current/blocks` or any real page, stays as a
second, defense-in-depth layer — but by the time code reaches that
path, CI has already made a real collision impossible to ship.)

### Discovery: one new API route, one one-time edit to `BlockRenderer.astro`

`apps/public-site/src/lib/resolve-theme-page-blocks.ts` globs
`~theme/blocks/*.block.ts` / `*.astro` / `*.locales.json` (same
build-time-only `import.meta.glob` technique `resolveThemeBlockOverride`
already uses), validates every candidate, and **throws** on any failure
— this runs at first import in a real server process (not literally at
`astro build`, since a non-prerendered route's module only executes on
first request — verified directly: a deliberately broken `StatusBadge.block.ts`
still let `astro build` exit 0, then 500'd the first real request with
the exact validation message). A developer sees this immediately in
local dev; CI's per-theme spec (above) is what actually keeps a broken
theme block from being merged in the first place.

- `GET /api/themes/current/blocks` (new route, same shape as the other
  3 `/api/themes/current/*` routes) serves the validated set as JSON —
  `apps/editor-app` fetches it once per session (`staleTime: Infinity`,
  same posture as the icon/token queries) and merges it client-side
  (`mergeThemeBlocks()`, degrades a single bad entry rather than
  throwing — the browser boundary gets a softer failure mode than the
  server one, on purpose).
- `BlockRenderer.astro` needs exactly one new line, once, ever:
  `Object.assign(BLOCK_REGISTRY, themeBlockRegistry(Object.keys(BLOCK_REGISTRY)))`
  right after its existing ~48-entry object literal. The file's dispatch
  logic (`dispatchProps` reading `entry.schema`/`.styleOverride`/
  `.locale`/`.containerProps` generically) was already data-driven — no
  other change needed there, now or for any future theme block.
- A theme block reuses the _same_ `pageBlockCategories` accordion
  buckets a core block of that `category` renders under
  (`BlockDescriptor.category`, previously vestigial for core blocks) —
  no separate "theme blocks" section in the picker.
- `apps/public-site/src/lib/resolve-theme-block-style-defaults.ts`
  folds a theme block's own `defaultStyle` into the same
  `/api/themes/current/block-style-defaults` response the editor
  already reads per block type — `block-style-fields.tsx` needed zero
  changes.

### i18n: co-located, merged into i18next at runtime

`Faq.locales.json`'s `{en, it}` fragments get merged via
`i18next.addResourceBundle(locale, 'translation', {blocks:{faq:...}},
true, true)` — deep merge, never overwrites the ~50 existing core block
keys already loaded at editor-app startup. Every block label already
resolves through `tLabel()` (`t(key, {defaultValue:key})`,
`apps/editor-app/src/lib/use-translation.ts`), which accepts a plain
runtime string — no `CustomTypeOptions` augmentation needed for a key
i18next only learns about after a fetch.

### Proof: `StatusBadge`, a real block in `themes/docs-showcase`

A status pill ("Beta"/"New"/"Deprecated"/"Info" — this repo's own ADRs
already use exactly this vocabulary). Non-container, `stylableProperties:
['backgroundColor','textColor']` with theme-token `defaultStyle`,
`category: 'content'`. Live-verified end to end in a real browser
(editor-app + public-site prod build + api, all running): appears
translated (not a raw key) under "Contenuto"/Content next to the core
blocks of that category, drags/inserts into a real page, renders in the
canvas iframe with the theme's own styling, its Inspector fields
("Testo"/"Tono", each option) are fully translated, publishes, and the
published output matches. `config.ts`, `BlockRenderer.astro`, and both
locale files needed zero further edits for `StatusBadge` specifically —
the concrete proof this ADR set out to produce.

## What this does not change

Pure `.astro` overrides of an existing core type (no matching
`.block.ts`) are untouched — same mechanism as before this ADR.
`PageLayout.astro`/`theme.css`/icon overrides are untouched. `apps/api`
needed zero changes — `Block.type` was already a free `z.string()` and
`Block.props` was already a generic record. `kind: 'custom'` fields
(carrying a live React `ComponentType`) are rejected by
`validateThemeBlockSet()` — they can't cross the HTTP/JSON boundary to
`apps/editor-app`, a stated limitation, not a silent gap. A theme
block's own prose (e.g. `StatusBadge`'s `label`) is not wired into
on-site search — `libs/shared-types/src/lib/search-text.ts`'s
`PROSE_FIELD_EXTRACTORS` only recognizes the closed set of core block
types by construction, so a theme type is invisible to it by default,
not by an added exclusion.

## Consequences

- Adding a genuinely new block type — first-party or, going forward,
  third-party — no longer requires editing `libs/block-registry`,
  `BlockRenderer.astro`, or the editor-app locale files. It requires
  three files under `themes/<name>/blocks/` and nothing else, checked
  by the same theme's own CI-run spec before it can ship broken.
  `themes/docs-showcase` (the team's own site) is the first real
  consumer of this, per the product owner's explicit request to
  dogfood it rather than special-case Kometio's own theme.
- `themes/*` joining the Nx/pnpm workspace is a strict improvement in
  coverage, not just for this feature: any future theme file (override
  or extension block) now gets real `tsc` type-checking, linting, and
  its own tests in CI, none of which existed before this ADR for
  anything under `themes/`.
- The label-key and CI-level collision checks added here are stricter
  than what core blocks currently get (nothing mechanically checks a
  core block's `label` string against its own key convention today) —
  a deliberate asymmetry: this mechanism is new and meant to be the
  safer path by default, not a reason to go back and retrofit the
  same strictness onto 44 already-shipped core blocks in the same
  change.
- Still out of scope, unchanged from docs/adr/0037's own deferral: an
  installable third-party npm package for a block, runtime hot-swap
  without a rebuild, and any change to the "Docker image is the unit
  of distribution" posture (docs/adr/0021/0032). Adding a theme block
  still means rebuilding and redeploying that theme's image.

## Amendment — 2026-09-02: which theme a site uses becomes runtime-selectable

[ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md)
deliberately, narrowly crosses the "Docker image is the unit of
distribution" boundary named above — not by removing it, but by bundling
every theme a deployment ships into one image and letting a site pick
among them at runtime. Adding a _new_ block type, or a genuinely new,
not-yet-bundled theme, still requires a rebuild exactly as described
above — this amendment only changes which _already-bundled_ theme a
given site renders, not how a theme or block gets built in the first
place.
