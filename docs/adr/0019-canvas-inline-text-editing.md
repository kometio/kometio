# 0019 — Canvas inline text editing via Puck's `contentEditable`

**Status**: Superseded by [ADR-0028](0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md) — 2026-08-28

## Context

Editing text in `apps/editor-app` meant typing into a field in Puck's
right-hand sidebar (built for attributes/colors, not prose) while watching
the change appear in the canvas — indirect compared to the Gutenberg-style
"click the text on the page, type there" editing the user actually wanted.
Point 9 of `piano-progetto-astro-cms.md` already records the longer-term
decision to eventually replace Puck with an in-house editor; this ADR is
about what's achievable with Puck as it stands today, not that
replacement.

Puck 0.23 turned out to already support this natively: a `contentEditable:
true` flag on a `text`/`textarea` field activates Puck's own
`InlineTextField` transform, which swaps the rendered value for a real
`<span contentEditable>` in the canvas; `visible: false` on the same field
hides the now-redundant sidebar control.

## Decision

### `contentEditable: true` + `visible: false` on every direct, simple text field

Applied to every block field that renders as plain visible text with no
further transformation: Hero/Text bodies, Accordion question/answer,
Banner title/text/button, Breadcrumb `homeLabel`, Button label, Countdown
label, Feature title/text, Submenu label, NavLink label, PromoBar message,
Quote text, Rating label. No change to the persisted data format — this
only touches each block's own field definition in
`libs/puck-config/src/lib/blocks/*.block.tsx`, never the canonical
`Block[]` content model (ADR-0007) or the API/domain layers.

### Deliberately excluded, not overlooked

- **Non-text-rendered fields** (`url`, `alt`, `placeholder`) — there's no
  visible text node in the canvas to attach the editable span to.
- **Structured values with a required format** (Countdown's `targetDate`,
  an ISO string) — free-text canvas editing would let a visitor-facing
  value drift out of the format the block's logic depends on.
- **Glyph/icon fields** (Feature `icon`) — not prose.
- **Composed strings** (Quote's `author`/`role`, joined as
  `"${author} — ${role}"` before render) — incompatible with the
  mechanism: Puck's inline transform replaces the rendered _value_ with a
  DOM node before `render()` runs, which only works for a field whose
  value **is** the rendered text, not one that's concatenated with
  something else first.

Each exclusion is commented inline in the block file it applies to, not
just recorded here — a future contributor adding a field to one of these
blocks needs the reasoning at the point of the decision, not only in this
document.

### Known rough edges, accepted rather than worked around

Scripted rapid interaction (e.g. a `Ctrl+A` select-all immediately after
focus, or two fast keystrokes landing on two different blocks back to
back) reproduced a real React error once ("Maximum update depth
exceeded") with text landing in the wrong block. A slower, human-paced
interaction (click, triple-click to select, type, blur) did not reproduce
it. This reads as an instability at the edges of Puck's own
`InlineTextField` implementation under rapid input, not a defect in how
these blocks are configured — accepted as a known limitation of the
underlying library rather than something worth building a workaround for,
consistent with point 9's framing of Puck as a placeholder to be replaced
eventually, not a foundation to invest in hardening.

## Consequences

- Every block listed above now renders its text fields with zero sidebar
  duplication — the sidebar only shows fields that still need it
  (non-text values, or fields deliberately excluded above).
- Any **new** simple-text field added to an existing or new block should
  default to this pattern unless it falls into one of the excluded
  categories — the exclusions above are the checklist, not this block
  list, which will grow.
- No test coverage added specifically for the rapid-interaction edge case
  (a Puck-internal timing issue, not application logic) — noted here so
  it isn't rediscovered as a surprise later.
