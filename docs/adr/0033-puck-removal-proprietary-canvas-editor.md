# 0033 — Puck removed, replaced by a proprietary canvas editor

**Status**: Accepted — 2026-08-21

## Context

Puck (`@puckeditor/core`, the React drag-and-drop page-builder library)
was the editor's foundation from Phase 2 (PR #27) through PR #74. Two
problems accumulated to the point of forcing a decision, not just a
patch:

- **A confirmed upstream Puck bug with no workaround inside Puck
  itself**: `InlineTextField`'s `contentEditable` implementation calls
  `ref.current.replaceChildren(safeValue)` on every keystroke whenever
  the store's value doesn't already match the DOM's `innerText`. This
  destroys the browser's caret/selection the moment a text block sits
  nested inside a `Slot` (Column/Container) rather than at the page
  root, where re-renders keep stable DOM identity. Confirmed by reading
  `@puckeditor/core@0.23.0`'s own source, not guessed — see the fix
  shipped for it, PR #70: a sidebar-`<textarea>` fallback
  (`withInlineTextFallback`), not a real fix, since the caret bug lives
  inside Puck's own reconciliation and can't be patched from the
  consuming app.
- **A structural duplication problem, independent of the bug**: Puck's
  canvas rendered React re-implementations of every block
  (`libs/puck-config`), while `apps/public-site` rendered the same
  blocks in Astro (`BlockRenderer.astro`) for real visitors. Every block
  existed twice, in two different rendering technologies, with no
  mechanism to guarantee the editor preview matched the real published
  output — a second, growing maintenance burden distinct from the caret
  bug, and one Puck's architecture (a React canvas by design) offered no
  path out of.

Reference points consulted before deciding: ApostropheCMS (TipTap for
text, universal hover chrome + breadcrumb, per-block "+" insertion
points, curated per-block style palette) — not adopted wholesale, but
its "the canvas renders the real thing, not a simulated one" principle
directly shaped the alternative below. The full 4-day implementation
plan the user approved lives at
`~/.claude-personal/plans/federated-churning-seal.md` (a local planning
file, not part of this repository) — this ADR records the decision and
its outcome, not the day-by-day breakdown.

Two options were on the table: patch around the caret bug indefinitely
(more sidebar-fallback cases as more blocks moved into containers, plus
living with the dual-implementation problem forever), or replace Puck
entirely with an in-house canvas editor. The user explicitly rejected a
partial/incremental patch approach and asked for the complete rewrite,
including header/footer editing (not left on Puck as a "fast follow")
and a real `Block.id` backfill (not lazy/ephemeral regeneration) — see
`docs/adr/0007` for the pre-existing `Block[]`-with-`children` content
model this rewrite reused unchanged, since that model was already
independent of Puck's own data format by design.

## Decision

**Puck is fully removed.** There is no `libs/puck-config`, no
`@puckeditor/core` dependency, anywhere in the workspace (commit
`5555047`, "sostituzione completa di Puck con editor visuale da zero",
PR #75, merged 2026-08-21). It is replaced by a from-scratch canvas
editor, `apps/editor-app/src/app/canvas/`, built around three decisions
that directly answer the two problems above:

### The canvas renders real Astro output via an iframe, not a simulated React tree

`CanvasFrame` (`canvas-frame.tsx`) points an `<iframe>` at
`apps/public-site`'s own preview route (a signed preview token per
`PageTranslation`, docs/adr/0024), the exact same Astro rendering path a
real visitor gets — not a second React implementation of each block.
This eliminates the dual-implementation problem structurally: there is
only one renderer for any block, `apps/public-site`'s `.astro`
component; the editor never re-implements it. A `postMessage`-based
bridge (`use-preview-bridge.ts`, `apps/public-site`'s
`init-preview-bridge.ts`) carries click-to-select, hover highlighting,
and live prop-patch fragment updates (`renderBlockFragment`,
`block-fragment-api-client.ts`) between the parent app and the iframe.
Selection/drag chrome is drawn as an absolutely-positioned overlay
(`overlay-layer.tsx`) tracking the iframe's real DOM geometry
(`useIframeGeometry`), not injected into the iframe's own document.

### Inline text editing mounts TipTap directly on the selected block, in place

`use-text-edit.ts` mounts a real TipTap editor instance onto the
selected block's DOM node inside the iframe on double-click, replacing
it on blur/deselect — no `contentEditable`-diffing loop, no DOM
replacement per keystroke. This is what makes nested inline editing
work uniformly (`FieldDescriptor.inlineEditable`, `field-types.ts`):
there is no `parent.type !== 'root'` special case any more, because the
caret-destroying mechanism that only existed at Puck's root level is
gone entirely, not special-cased around. This directly supersedes the
first iteration of this same idea — `docs/adr/0019` ("Canvas inline
text editing via Puck's `contentEditable`"), itself already a partial
step away from Puck's default field editing, superseded in turn by
`docs/adr/0028` ("Canvas inline text editing via TipTap mounted inside
the live preview iframe") once the iframe-based canvas existed to mount
it in. This ADR is the architectural umbrella both of those sit under;
0028 documents the TipTap mechanism's own detail and stays the
authoritative source for it.

### Undo/redo is a granular command pattern, not Puck's history stack

`use-block-tree-mutations.ts` (added in the later god-component-split
pass, PR #96) tracks every structural edit — insert, remove, reorder,
move, duplicate — as an explicit `{ before, after }` action with
type-specific `syncForward`/`syncBackward` closures, wired to toolbar
buttons and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z. No generic undo primitive
exists across the drag library (`dnd-kit`) used for reordering/drag
insertion (`use-sidebar-drag.ts`), so each mutation type owns its own
inverse rather than relying on a diff-based generic undo. Property
edits are debounced and single-flighted separately
(`use-property-patch.ts`), outside the undo stack's scope (a
prop-by-prop undo of every keystroke was explicitly not built).

Blocks are declared as data (`BlockDescriptor`,
`libs/block-registry/src/lib/field-types.ts`) instead of Puck
`Config<Props>` field definitions — one descriptor per block file (e.g.
`libs/block-registry/src/lib/blocks/hero.block.ts`), consumed by both
the editor's `InspectorPanel`/`BlockPicker` and, on the rendering side,
`apps/public-site/src/components/BlockRenderer.astro`'s dispatch table.
`BlockDescriptor.isContainer`/`allowedChildTypes` express nesting
directly against `Block.children` (docs/adr/0007) — no Puck `Slot`/zone
mapping layer exists any more, because there is nothing on the Puck
side left to map to or from.

## Consequences

- Every block that existed as a Puck React component (48+ block types
  at the time of the rewrite) was ported once, to
  `BlockDescriptor` + the pre-existing `.astro` renderer — the editor
  no longer needs its own render implementation per block, only a field
  descriptor.
- The iframe-based canvas introduced its own genuinely new class of
  problems that Puck's in-process React tree never had — CORS between
  the editor origin and the public-site preview origin
  (`docs/adr/0030`), CSP `connect-src` gaps, and a real Astro dev-server
  limitation (Astro ≥6's `Sec-Fetch` sandboxed-iframe block, also
  documented in `docs/adr/0030`) that makes local canvas QA require
  public-site's **production** build rather than its dev server. These
  are the direct cost of "the canvas is the real thing," accepted
  deliberately rather than discovered as a surprise.
- `libs/domain-core`'s `Block` content model (docs/adr/0007) needed no
  change at all — it was already independent of Puck's own data format
  by design, which is exactly why the rewrite could replace the editor
  without a content migration.
- Undo/redo, contextual block toolbar, breakpoint/page switchers,
  Preview/Publish restyle, page duplication, and the Global Styles
  Editor were all built new for this canvas (PR #76 onward) — none of
  these existed as Puck features being ported; they are net-new
  capability the in-house editor made possible.
