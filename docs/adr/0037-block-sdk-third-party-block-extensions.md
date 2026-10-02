# 0037 — `libs/block-sdk`: a dedicated package for third-party block extensions

**Status**: Accepted — 2026-09-01

## Context

Registering a block today — first-party or third-party — means touching
up to 4 places: a `.block.ts` descriptor in `libs/block-registry` (see
`libs/block-registry/src/lib/blocks/hero.block.ts` for the shape), a Zod
schema + inferred type in `libs/shared-types`, an `.astro` render
component in `apps/public-site/src/components/blocks/`, and a manual
entry in `apps/public-site/src/components/BlockRenderer.astro`'s
`BLOCK_REGISTRY` dispatch table plus `pageBlocks`/`pageBlockCategories`
in `libs/block-registry/src/lib/config.ts`. All 49 existing blocks are
first-party, hand-written as plain `BlockDescriptor` object literals —
nothing about that shape or process was ever made concrete as a public
extension surface a third-party developer could target without reading
`block-registry`'s internal blocks as informal precedent.

This gap was already scoped in `piano-progetto-astro-cms.md`'s
"Considerazioni aggiuntive" (point 2), which explicitly distinguishes
two different pieces of work: a small, near-term "Block SDK" — a
documented `defineBlock({ schema, component })`-style factory with at
least one worked example — versus a much bigger, explicitly deferred
"Extension Manifest": a declarative mechanism (comparable to WPackagist
for Bedrock) for dynamic runtime plugin discovery/loading of blocks,
hooks, and adapters. This ADR is about the first piece only. The
Extension Manifest is out of scope here, deferred until real third-party
extension requests exist post-launch — this decision does not change
that deferral or move it closer.

Two shapes were on the table for where the factory should live:

1. Add `defineBlock()` directly into the existing `libs/block-registry`,
   alongside the 49 first-party block descriptors it already contains.
2. A new, dedicated Nx library — `libs/block-sdk` — exposing only the
   extension factory, with no first-party block implementations in it
   at all.

## Decision

**Option 2: a new dedicated library, `libs/block-sdk`.** A third-party
block author importing `@kometio/block-registry` directly would be
importing a package whose primary content is Kometio's own 49 built-in
blocks, with the extension surface sitting somewhere inside it as one
export among many — a package that reads as "the first-party block
implementation library that also happens to export a factory" rather
than "the stable public API surface for extending Kometio with your own
blocks." `libs/block-sdk` containing _only_ the extension surface
signals that distinction structurally, not just by convention or
documentation: everything exported from it is public API by
construction, because nothing else lives there.

`defineBlock()` (`libs/block-sdk/src/lib/define-block.ts`) is a
validated factory, not a parallel or different mechanism from the
plain-object-literal `BlockDescriptor`s every first-party block already
uses — `DefineBlockConfig<Schema extends z.ZodType>` takes the same
fields a `BlockDescriptor` needs (`type`, `label`, `category`,
`defaultProps`, `fields`, `isContainer`, `allowedChildTypes`,
`stylableProperties`, `defaultStyle`) plus one addition, a required
`schema: Schema`. `defineBlock()` calls `schema.parse(defaultProps)` at
module-load time — a typo'd or missing default field fails immediately
and loudly at import time, not silently at first render — then returns
the exact same `BlockDescriptor` shape the 49 existing blocks already
produce (`schema` itself is not stored on the returned value; the
function's whole job is validating `defaultProps` against it once, then
getting out of the way). This follows the project's existing "a Zod
schema is the single source of truth" precedent (`docs/adr/0026`)
rather than introducing a second way of deriving a type from runtime
validation rules.

The dependency direction turned out to be the opposite of the first
draft of this decision: `libs/block-sdk` cannot depend on
`@kometio/block-registry` for the `BlockDescriptor`/`FieldDescriptor`
types, because `block-registry`'s own blocks need to depend on
`block-sdk` for `defineBlock()` — a package containing only first-party
blocks depending on the extension factory, and the extension factory
depending back on that same package for its core types, is a circular
dependency. `libs/block-sdk/src/lib/field-types.ts` is therefore the
canonical home of `BlockDescriptor`/`FieldDescriptor`/`FieldBuilder`
now; `libs/block-registry/src/lib/field-types.ts` is a one-line
re-export (`export * from '@kometio/block-sdk';`) so none of
`block-registry`'s ~49 existing `import type { BlockDescriptor } from
'../field-types'` lines needed to change. `libs/block-sdk` depends on
`@kometio/shared-types` (for `BlockStyleDefaults`/`BlockStyleOverride`)
and `zod` — not on `block-registry`. Its `package.json`
`nx.tags: ["domain"]` places it in the same dependency tier as
`block-registry` itself, not as an app-level concern.

### What this deliberately does not unify

`defineBlock()` produces a `BlockDescriptor` — the editor-side
inspector/canvas metadata. It does **not**, and by design cannot, also
register the block's Astro render component or wire it into
`BlockRenderer.astro`'s dispatch table: those stay separate, manual,
build-time steps, exactly as they are for every first-party block
today. This is consistent with `docs/adr/0021`/`docs/adr/0032`'s
already-established principle that a Docker image is the unit of
distribution and is build-time-only — there is no runtime plugin
loading anywhere in this product, and a third-party block's render
component becoming "pluggable" without a rebuild would be a materially
different (and currently unwanted) product shape. A third-party block
author using `libs/block-sdk` still needs to add their own `.astro`
component and register it in `BlockRenderer.astro`'s dispatch table
themselves, at build time, same as any first-party contributor — this
ADR makes the descriptor half of that process validated and documented,
not the whole process automatic.

## Consequences

- Third-party (and first-party) block authors get one schema-validated
  entry point (`defineBlock()`) instead of hand-writing a
  `BlockDescriptor` object literal and hoping `defaultProps` stays in
  sync with whatever type they separately declared for it — a class of
  drift bug (`defaultProps` silently not matching the block's real prop
  shape) becomes a thrown error at import time instead of a runtime
  surprise.
- `libs/block-sdk` importing `@kometio/block-registry` means a
  third-party block author's dependency graph is small and legible: one
  package with no first-party block implementations, no React-Testing-
  Library-heavy transitive surface, and no editor-app-specific code —
  a deliberately narrow public API footprint.
- The render-component and `BlockRenderer.astro` registration steps
  remaining separate, manual, build-time steps means `libs/block-sdk`
  alone does not turn Kometio into a runtime-extensible plugin platform —
  that remains explicitly the Extension Manifest's job, still deferred,
  still post-launch, still contingent on real third-party demand
  materializing first.
- `libs/block-sdk` ships with a README (the registration walk-through:
  schema → descriptor → render component → `BlockRenderer.astro` entry
  → i18n labels) and one real worked example,
  `libs/block-registry/src/lib/blocks/callout.block.ts` — a genuine,
  selectable `Callout` block (`apps/public-site/src/components/blocks/Callout.astro`),
  not a standalone unregistered sample, built with `defineBlock()` and
  wired into `BLOCK_REGISTRY` exactly like any first-party block. It
  exists to let this ADR's claims be traced against real, running code
  instead of a hypothetical.
