# 0062 — What the panel asks, and what it hides

**Status**: Accepted — 2026-09-09

## Context

ADR-0061 covered six of Fase 7's ten points and named the four it left
open. Three of those four are the ones the plan itself flagged as model
changes rather than additions, and they are what this decision covers:

- the bridge carried **one** `selectedBlockId`, so "delete these five"
  meant deleting one block five times, each its own undo step;
- dragging on the canvas to reorder was gated to **top-level** blocks, so
  the three columns of a Columns could be reordered from the Layers panel
  and not from the page they were on;
- a block's fields were one flat list, always all of them, and its
  per-instance styling was **a second popover behind a second button** —
  changing a heading's text and its colour were two different places with
  two different shapes for the same block.

(The fourth, reparenting from the Layers panel, shipped in ADR-0061.)

## Decision

### Selection is a list, and the modifier belongs to the event

`selectedBlockId` stays, and is now the LAST id of `selectedBlockIds`
rather than a second source of truth. Everything that needs exactly one
block — the toolbar, the inspector, `Alt`+Arrow — keeps reading it and
keeps working; everything that can act on many reads the list.

`Cmd`/`Ctrl`+click toggles a block in and out of the selection; a plain
click replaces it. The modifier is read where the click actually happens
— inside the iframe, on the event — and travels in the `preview:click`
payload as `additive`. The editor cannot read it any other way: the
canvas is a sandboxed, opaque-origin frame, so the editor never sees the
event, only the message. Reading `event.metaKey` from a keydown listener
on the editor side would be reading a different event and hoping the two
agreed.

Bulk delete, duplicate and paste are each ONE mutation over the whole
selection and therefore one undo step. This is not a refactor for
elegance: looping the single-block mutation reads the same stale tree
each time and the last write wins, which silently dropped blocks. A test
found it before the browser did.

### A drag reorders a block among its own siblings, at any depth

The root-level gate is gone. What replaces it is the sibling set: a drag
computes its drop targets from the rects of the dragged block's own
siblings — the children of its parent, whatever that parent is — so a
column moves among columns and a card among cards. A drag never changes
a block's parent; that is what the Layers panel does (ADR-0061), and
keeping the two separate is what makes each of them predictable.

`isRootLevelBlock` is deleted rather than left unused: a helper that
encodes a rule the product no longer has is a rule waiting to be
re-applied by the next person who finds it.

### A field can say when it is worth asking

`FieldDescriptor` gains `showWhen: { field, equals }` — one comparison
against one sibling prop on the same block.

Deliberately not a predicate function and not a boolean algebra. A
descriptor must survive JSON, or a theme cannot declare a conditional
field (ADR-0048's additive rule) and the API cannot read one; a function
does not. And every case the registry actually has is of this shape: the
`url` field only when the link points at a url, the `page` picker only
when it points at a page, `alt` only when the image is not decorative. A
richer language would be inventing needs rather than answering them.

An **absent** prop counts as `false`. This is the rule that decides
whether the feature is usable on real data at all: an image saved before
`isDecorative` existed has no such prop, and reading its absence as "no
answer" would hide the alt-text field on every image already on the site.

Visibility is an inspector concern and nothing else. A hidden field's
value keeps existing, keeps being stored, keeps being translated — what
changes is that the editor stops offering an input that the renderer was
already ignoring. `linkType` decides which of `page`/`url` a block links
to in every `.astro` component; the other field was visible, accepted
what you typed, and did nothing with it.

A hidden required field also stops warning. The warning is drawn per
field, so leaving it would put "required" under a label that is not on
screen.

### Content, Style, Advanced — and one panel, not two

The fields are grouped. `group: 'content' | 'style' | 'advanced'`,
absent meaning `content`, so every field written before this lands
exactly where it always was.

The split is the one a person already makes when they look at a panel of
fourteen inputs and try to find the one they came for: what the block
SAYS, what it LOOKS like, and what most people never touch. Content and
Style open; Advanced is folded away, which is the entire reason it is a
group of its own.

The per-instance style controls moved INTO that Style group, and the
Palette button that used to open them is gone. They arrive as a slot the
toolbar fills, not as a dozen more props on the inspector: the toolbar
already holds the theme's ceiling, the properties the theme added, the
current breakpoint, the resolved defaults and the tokens, and threading
all of that through the panel would make it know about styling it does
not otherwise touch. What the panel decides is WHERE those controls go.

The **type-level** style button stays a separate button on purpose. It
edits every block of that type across the site — a different thing to be
doing, not a different tab of the same thing.

The theme's ceiling (ADR-0021) now has to keep the style FIELDS out
rather than hide a button. Gating the button was enough when the fields
lived behind it; it is not any more, and the test that says so opens the
merged panel and looks inside it.

## Consequences

- The bridge protocol gained one optional field. An older canvas that
  does not send `additive` behaves exactly as before — every click
  replaces the selection.
- Three copies of the same five-option `aspectRatio` select (Image,
  Gallery, VideoEmbed) became one shared field, which is also where its
  `group: 'style'` is declared once.
- `Link`/`NavLink` still fall back to `url` when `linkType` is `page` and
  no page has been picked — a pre-existing quirk, now slightly more
  surprising because the field being fallen back to is not on screen.
  Left alone here because changing it changes what published pages
  render; **fixed straight after, in ADR-0063**, which also found the
  same expression 404ing inside the theme's own Button override.
- Fase 7 is closed. What the plan lists after it is Fase 8, taxonomies.
