# 0061 — The canvas under the hands

**Status**: Accepted — 2026-09-08

## Context

Fase 7 of the preparatory plan lists ten things the canvas was missing.
They are not features in the sense the earlier phases were — nothing here
lets a site do something it could not do before. They are the difference
between an editor somebody can use all day and one they can use for a
demo.

This decision covers six of them. The four that remain — multi-select,
reparenting from the Layers panel, dragging a nested block on the canvas,
and merging the two style popovers — are named at the end.

## Decision

### Copy and paste use the editor's own clipboard, not the system one

`Cmd+C` puts the selected block in React state; `Cmd+V` inserts a copy
beside the selection.

Not `navigator.clipboard`. Reading the system clipboard needs a permission
prompt, and writing a block to it means serialising the block tree as
text — so the next time that person pastes into an email they get a wall
of JSON. The thing being copied is a **block**, and the only place a block
means anything is this editor.

The cost is real and accepted: the clipboard does not survive a reload,
and it cannot carry a block to another browser tab. What it does carry it
across is pages, which is the case that actually comes up.

Every paste calls `cloneBlockWithNewIds` — the function Duplicate already
used. Two pastes of one copied block must not share ids: those key the
per-instance style rule and the translation overlay, so a style set on the
second copy would land on both.

### `Alt`+Arrow moves a block; a bare arrow still scrolls

The arrows scroll a page, and taking that away from somebody reading a
long one so they can nudge a block is the wrong trade. `Alt` is what an
editor with a tree usually binds this to.

`Delete` and `Backspace` both remove the selection, and every shortcut is
skipped while the focus is in one of the editor's own inputs — `Delete`
has to delete a character there. Text editing **on the canvas** is not
this listener's problem at all: it happens inside the sandboxed iframe, a
separate document whose key events never reach the parent.

### The shortcuts read through a ref, and the ref is written in an effect

The listener is attached once, with an empty dependency list. Undo and
redo could already get away with that because they read current state at
call time; the shortcuts added here cannot — they close over the selected
block and the tree, and a stale closure would delete the block that WAS
selected three renders ago.

So they go through a ref, and the ref is written **in an effect** rather
than during render: React forbids touching a ref while rendering and the
linter enforces it. Safe, because the listener only fires on a real key
press, which cannot happen before the first effect has run.

### `radio` is a radio group, and `select` is a dropdown

They used to fall through to the same `<select>`, so a descriptor could
say `radio` and get a dropdown — the difference existed only in the type.
They are not interchangeable: a radio group shows every option at once,
which is what a three-way choice like a Container's padding wants, while
a dropdown hides all but one, which is what a sixty-item list needs.

The group's `name` is scoped to the field **and the block**: two blocks of
the same type on one page would otherwise share a radio group, and picking
on one would clear the other.

### The breadcrumb is a trail, and every step of it selects

It was the selected block's own label — a label pretending to be a
breadcrumb. It is the ancestor chain now, and each step selects that
ancestor. A block inside a Column inside a Columns was otherwise
reachable only by hunting for a pixel its children did not already cover,
which is the whole reason the Layers panel had to grow click-to-select in
the first place.

### The picker has a search box, and it opens what it finds

Fifty-three insertable types in collapsed accordion sections meant finding
one required knowing which category somebody had filed it under.

The search matches the **translated label and the type name** both:
somebody reading the UI types "Immagine", somebody reading the docs types
"Image", and matching only one of the two is a search that works if you
already knew where to look. While searching, the matching sections are
forced open — a search that found three blocks and left them behind
collapsed sections would look like a search that found nothing.

### The custom fields join the design system

Seven of them carried inline styles with literal hex values —
`background: '#fff'`, `color: '#18181b'`, `1px solid #d4d4d8` — and four
carried Italian strings hardcoded in the markup.

The colours were not merely untidy: they are a white box with near-black
text, correct in the light theme and unreadable in the dark one, where the
panel around them is dark. They read the same tokens every other control
does now, and the strings go through i18n like the rest of the app.

### A block can move house

`computeNestedReorder` refused every cross-parent drop, so getting a block
into a Column meant deleting it and building it again in place — losing
its per-instance styling, its variant and its text. That is the item the
plan calls impossible by construction, and it was. `computeReparent`
moves the same block, with the same id, so all three survive.

Dropping onto a **container's own row** means "inside it, at the end" —
the only way to reach an empty container, which has no child row to aim
between. Dropping onto an ordinary row means "become its sibling".

Three refusals, each a real way to break a page rather than a nicety:

- **into its own subtree**, which detaches the block and everything under
  it from the tree;
- **into a container that does not accept that type**, the rule the
  drag-from-sidebar path already honours;
- **a same-parent drop between ordinary rows**, which is a reorder and
  belongs to `computeNestedReorder` — answering it in both places would
  give one gesture two implementations.

The panel is told those rules as two predicates rather than handed the
registry: it goes on knowing nothing about block descriptors.

On the canvas the move re-renders **both parents**, not the block. A
container shows different chrome when it gains or loses a child — an
empty-state hint appearing, a collection's arrows — and patching only the
moved node would leave that stale. One history entry for the whole move,
like the swap that turns a block into a section: an undo that put the
block back but left the hole open is a state nobody asked for.

## The invariant this needed, and did not have

`t()` is typed against `en.json`, so a key missing **there** is a compile
error. That is why the English side has never drifted. `it.json` had no
such backstop: a key added in English and forgotten in Italian falls back
to the English string silently, and the only way anyone finds out is by
reading the interface in Italian and seeing a word in the wrong language.

This phase added six groups of keys across two files. The parity check now
fails naming the exact missing key — verified by deleting one and watching
it go red.

## Consequences

- Seven keyboard shortcuts where there were two, and seven of Fase 7's ten
  items done.
- **Three are left, and none is an oversight.** Multi-select is a change
  of model, as the plan itself says: the bridge carries a single
  `selectedBlockId`, and every overlay, toolbar and mutation reads it.
  Dragging a NESTED block on the canvas is a second one — direct canvas
  reordering is scoped to top-level blocks by construction
  (`isRootLevelBlock`). And the Inspector's conditional and grouped fields
  are a question about what the Inspector should be, starting by merging
  two popovers into one. Each is a PR, not a paragraph. **All three
  shipped in ADR-0062**, which closes Fase 7.
- Verification here is the component tests against the real components,
  not a browser session: the editor sits behind a login whose credentials
  this work did not have. Every new test was checked by breaking the
  feature and watching it fail first — the delete shortcut, the
  copy/paste pair, the subtree guard, and the locale parity.
