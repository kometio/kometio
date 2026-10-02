# 0028 — Canvas inline text editing via TipTap mounted inside the live preview iframe

**Status**: Accepted — 2026-08-28

## Context

Puck was fully removed from `apps/editor-app` as part of the custom canvas
editor rewrite (`apps/editor-app/src/app/canvas/`: `canvas-editor-shell.tsx`,
`inspector-panel.tsx`, `layers-panel.tsx`, `use-preview-bridge.ts`, ...). The
new editor doesn't render blocks itself with React at all — it renders the
real page inside an `<iframe>` pointed at `apps/public-site`'s own preview
route (the actual Astro/HTML output, with `data-kometio-block-id`/
`data-kometio-field` attributes on the relevant nodes) and drives it entirely
through a typed `postMessage` protocol (`libs/shared-types/src/lib/
preview-bridge-protocol.ts`): hover/click/drag/reorder/insert/remove all
round-trip between the parent (`use-preview-bridge.ts`) and a small client
script injected into the iframe (`apps/public-site/src/lib/
preview-bridge-client.ts`).

ADR-0019's mechanism (Puck's `contentEditable: true` field flag, swapping in
Puck's own `InlineTextField`) doesn't exist anymore — there is no Puck
`Fields<T>` sidebar and no Puck-rendered canvas to attach it to. Inline text
editing needed a replacement that fits this iframe/postMessage model instead:
the parent doesn't own the DOM node being edited, the iframe does.

## Decision

### Double-click in the iframe enters edit mode; the parent only relays the request

A double-click inside the iframe on a block in the current editable scope
resolves the nearest `data-kometio-field` ancestor under the pointer
(`findFieldUnderPointer`) and reports it to the parent as
`preview:dblclick { blockId, field }` (`field: null` if the double-click
landed on the block but outside any editable field, e.g. padding). The
parent (`use-preview-bridge.ts`) doesn't decide _how_ to edit — it just
replies with `editor:enter-text-edit { blockId, field }`, the same
request/relay shape as every other bridge interaction (hover, click, drag).

### TipTap mounts in place, inside the iframe's own document

`enterTextEdit` (`preview-bridge-client.ts`) finds the exact
`[data-kometio-field]` node (`findFieldElement`), empties it, and mounts a
TipTap `Editor` **directly on that DOM node** — not a separate overlay
positioned on top of it. This is a structural fix for the cursor bug ADR-0019
already flagged as a Puck-internal limitation ("Maximum update depth
exceeded" under rapid input): no React re-render drives that node anymore
once TipTap owns it, so there's no reconciliation to race with fast typing.

TipTap is constrained to `Document`/`Paragraph`/`Text` only — a single
paragraph, no marks, no other nodes. This matches the domain: every
`inlineEditable` field (`FieldDescriptor.inlineEditable`,
`libs/block-registry/src/lib/field-types.ts`) is a plain `z.string()` at the
content-model level (title/subtitle/body/...), never HTML — so
`editor.getText()` is always the correct read, never `editor.getHTML()`.

Only one TipTap instance is ever mounted at a time (`activeTextEditor`
module state in `preview-bridge-client.ts`); entering a new field or a blur/
Escape/other-block-selected tears down the previous one first
(`exitTextEdit`), writing the final plain text back as the node's
`textContent` — no page reload, no fragment patch needed for text, since the
DOM already shows live what was typed.

### Live typing goes back to the parent for the debounced draft save

Every TipTap `onUpdate` posts `preview:text-changed { blockId, field, text }`
to the parent, which applies it to its own `Block[]` state immediately
(optic feedback) and schedules the same debounced draft save used for every
other field edit in `canvas-editor-shell.tsx` — inline text editing is not a
separate save path, just a different input source feeding the same
mutation.

## Consequences

- The mechanism now lives entirely in Kometio's own code
  (`preview-bridge-protocol.ts`, `preview-bridge-client.ts`,
  `use-preview-bridge.ts`), not inside a third-party editor's field
  transform — the rapid-interaction cursor instability ADR-0019 accepted as
  an upstream limitation is structurally gone, not just avoided.
- Inline editing now depends on `@tiptap/core` + `@tiptap/extension-
{document,paragraph,text}` being present in `apps/public-site` (the iframe
  target), not `apps/editor-app` — a deliberate consequence of the
  iframe/postMessage architecture: the code that touches the actual editable
  DOM node has to run wherever that DOM node lives.
- `inlineEditable` (`FieldDescriptor`) replaces ADR-0019's
  `contentEditable: true` + `visible: false` pair, but is not a full
  drop-in: unlike Puck's `visible: false`, an `inlineEditable` field is
  **not** hidden from `InspectorPanel` — every field, inline-editable or
  not, still renders there too, by design (`inspector-panel.tsx`'s own
  comment: a real, always-available fallback for editing any field, not
  just a stopgap). Double-click-on-canvas and the sidebar are two entry
  points to the same `Block.props`, not a primary path with a hidden
  duplicate.
- The same category of exclusions ADR-0019 recorded (non-text-rendered
  fields like `url`/`alt`; structured values like Countdown's `targetDate`;
  glyph/icon fields; composed strings like Quote's `author`/`role`) still
  applies and for the same reasons — `inlineEditable` is only ever set on a
  field whose value **is** the rendered text, unchanged from before.
- Editing is only possible for a block inside the current editable scope
  (`isBlockInteractive`/`editingSection` in `preview-bridge-client.ts`) —
  the same scoping rule that already governs hover/click/drag, not something
  specific to text editing.
