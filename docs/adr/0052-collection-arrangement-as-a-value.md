# 0052 — A collection's arrangement is a value, not a block type

**Status**: Accepted — 2026-09-08

## Context

There are ten collection blocks, and each had **one hard-wired
arrangement**. `Testimonials` was a slider. `Team` was a grid.
`PricingTable` was a grid. Wanting the team as a slider, or the
testimonials as a grid, meant a new block type.

That multiplies badly. Ten collections times four arrangements is forty
nearly identical files — each with its own CSS, its own RTL handling, its
own accessibility, its own translations, all to be kept correct forever.
It is also how a block count gets to 100 in the way that makes the product
worse rather than better.

The duplication had already started on its own: `Testimonials` and
`ImageSlider` each carried a track, a pair of nav buttons and a
thirty-line behaviour file. Diffed against each other, the two differed by
a class name and by whether one press scrolled a card's width or the
track's.

## Decision

**The arrangement is a value on the block**, and one engine implements it:

```
grid      every item visible, wrapping onto rows
slider    one at a time, scroll-snapped, with prev/next
carousel  several at a time, scrolling sideways
```

`CollectionLayout.astro` owns the track, the buttons and the classes;
`block-behaviors/collection.ts` owns the scrolling, replacing both
behaviour files. A block keeps its own class and its own look, and hands
over only how its children are arranged.

**Each collection's default is the arrangement it already had**, so no
existing page changes: `Testimonials` defaults to `slider`, the four grids
to `grid`.

### A prop, not a field of the block

`variant` (ADR-0048) and `align` (ADR-0049) are fields of `Block` rather
than props. The rule those follow is _can a theme change the set of legal
values?_ — a theme may add or drop a variant, so content pointing at one
cannot live in props.

These three arrangements are core's own, implemented in core CSS, and a
theme cannot remove one. There is no dangling value to protect against.
Being a prop also means the editor already re-renders the block when it
changes, which is exactly what switching arrangement needs, with no new
plumbing at all.

### And a container for the other half

`Slider` is a new block that holds anything and arranges it the same way.
The two answer different questions and neither covers the other: turning a
`Testimonials` into a carousel keeps it _testimonials_ — with its
type-level styling, its variants, and one day its WordPress import —
whereas putting three arbitrary blocks in a slider is something no typed
collection can express.

### Sizing lives on the track

The items are sized with `grid-auto-columns` on the track rather than a
width on the children. In the editor every block is wrapped in a
`display: contents` element (`BlockRenderer.astro`), which generates no
box — so a width rule matching the track's direct children hits that
wrapper and never reaches the real card. Sizing the track's implicit
columns works in both cases, because the children the wrapper passes
through become the grid items themselves.

`scroll-snap-align` is the one thing that cannot be hoisted, being a
property of the item, so it is the single place the wrapper is named.

## Consequences

**Two mistakes, both caught by measuring the built page rather than by
reasoning, and both now pinned as tests.**

The first: the block's root is rendered by `CollectionLayout`, not by the
block's own file, so Astro's scoped styles never reached it. `FeatureGrid`
silently lost its grid entirely — `display: block`, one 976px column
instead of four 226px ones. Every collection's own rules are `:global()`
now, and `collection-arrangement.spec.ts` fails, naming the file and the
selector, if one is not.

The second: the layout wrapped the children in a track for _every_
arrangement, including `grid` — which then had a single item to lay out.
The track exists only where something scrolls.

**The blocks that hand over their arrangement need `locale: true`** in the
renderer, because the shared nav buttons carry translated labels. The same
spec checks that too, since forgetting it throws only at render time.

Parity was verified by reading computed styles off the built site before
and after: identical on the page that renders one of these collections.
