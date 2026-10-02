# 0057 — What a picture can do

**Status**: Accepted — 2026-09-08

## Context

Fase 4 items 3, 4 and 6: Image, Gallery, VideoEmbed.

What each could do, before this:

- **Image**: a picture, an alt text, a caption. It could not link
  anywhere, could not be opened full size, could not sit anywhere but
  where the flow put it, and had whatever shape the file had.
- **Gallery**: a responsive grid of squares. The column count was
  `auto-fill minmax(200px, 1fr)` and nothing else; the shape was square
  and nothing else; there were no captions; and **the order of the
  pictures could not be changed at all** — the field only added and
  removed, so moving the third image meant deleting the last two and
  adding them back.
- **VideoEmbed**: a URL. Its consent gate — which is all a visitor sees
  until they click, since nothing is requested from YouTube before that —
  was a grey box.

## Decision

### Shared vocabulary, not per-block enums

`alignment` (start/center/end) and `aspectRatio` (original/square/
landscape/portrait/wide) are declared once and used by all three. Three
copies of "which shape is this picture" would drift, and the fourth block
to want one would make its own fourth spelling.

`aspectRatio: original` declares no `aspect-ratio` at all, which is what
every image already does — so the default changes nothing. Gallery's
default stays `square`, because that is what its CSS hardcoded.

`alignment` places the block's own box and is deliberately not
`contentAlign`, which aligns what is _inside_ a block. For an image
narrower than its column the first is the question people ask. It is
implemented with `auto` margins rather than flex so the figure keeps its
intrinsic width — and it required removing the `<figure>` element's 1em
default inline margin, which is why an image never sat flush against its
column.

### One lightbox, not one per block

`block-behaviors/lightbox.ts` serves Image and Gallery, and any block
that wants it later. Two copies of an overlay with a focus trap is the
mistake [ADR-0052](0052-collection-arrangement-as-a-value.md) had to undo
for the two sliders, made in advance this time.

The trigger is a real `<button>` in the markup, not a click handler on an
image: it has to be reachable by keyboard and announced as something that
does something. The overlay is `role="dialog"` with `aria-modal`, traps
Tab, closes on Escape and on a backdrop click, restores focus to whatever
opened it, and locks the body's scroll while open — the five things a
hand-rolled lightbox usually forgets.

**A link wins over a lightbox** when an image has both: a link is a
navigation the visitor asked for, a lightbox is a convenience, and
wrapping one in the other makes a single click ambiguous.

### Gallery columns collapse by container, not by window

A fixed count has to stop being fixed on a narrow screen, or six columns
on a phone are six unreadable slivers. The breakpoints are container
queries, so a gallery in a sidebar collapses for the same reason a
gallery on a phone does ([ADR-0047](0047-canvas-styling-architecture.md)).

### Reordering, and the key that makes it safe

The gallery field gained move-up/move-down, and with them a real problem:
its rows were keyed by array index, with a comment saying that was fine
because "rows are only added/removed here, never reordered". Reordering
under an index key leaves React reusing the previous row's input state,
so the caption just typed would appear on the wrong picture. The key now
includes the picked media's id.

The buttons are `disabled` at the ends rather than no-ops: a control that
looks available and does nothing is worse than one that says it cannot.

### The poster is what the consent gate needed

`VideoEmbed`'s gate is the only thing a visitor sees until they click, and
it was a grey box. The poster is a `background-image` on the gate rather
than an `<img>`: it is decoration for a control, and a screen reader gains
nothing from being told the video has a thumbnail. The gate also takes the
block's aspect ratio, so it is the same shape as the thing it stands in
for and the page does not reflow when the embed loads.

## Consequences

The gallery field's Italian strings moved to i18n while it was being
edited — it was one of the files Fase 7 lists for exactly that, and
adding new hardcoded Italian beside the old would have been the wrong
half of a job.

Verified by measurement against the built site: an unstyled image is
unchanged (`auto 800 / 600`, no wrapper element); a linked one renders an
`<a>` and no lightbox; a zoomable one renders a `<button>`; alignment
with a narrower figure gives 300/300, 0/600 and 600/0 for centre, start
and end; a three-column gallery renders three equal tracks at 4:3 with
one caption where one was set.

Item 7 of Fase 4 — layout variants for Feature and Banner, and a `Card`
block that does not exist — remains open.
