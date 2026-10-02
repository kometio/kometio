# 0056 — The Hero holds blocks, and the Button grew up

**Status**: Accepted — 2026-09-08

## Context

Fase 4 of the preparatory plan lists eight items. Only the eighth —
`stylableProperties` for the twenty blocks that had none
([ADR-0051](0051-every-block-is-stylable.md)) — had been done, and the
phase had been reported as closed. It was not.

This decision covers the first, second and fifth: the Hero, the
header/footer palette, and the Button.

Part of the first item turned out to be already done, which is worth
recording because it changes what "arrich the Hero" means. Background
image, overlay, minimum height and background positioning arrived as
**style properties** with [ADR-0047](0047-canvas-styling-architecture.md);
`Hero.astro` already read all four. What was missing was an eyebrow, the
ability to align its content, and being a container.

## Decision

### The Hero holds blocks

`Hero.isContainer` is true, and the block renders a slot for its children.
A button under the subtitle is what every landing page opens with, and
until now the only way to get one was a separate block _below_ the hero —
outside its background, outside its padding, and unable to sit on its
overlay.

The element becomes `display: flex; flex-direction: column`, which is what
makes `contentAlign` mean anything. `Hero.astro` used to carry a comment
refusing to offer alignment for exactly that reason:

> Alignment is NOT offered here yet, deliberately. This element is a
> block, not a flex container, so `align-items` would do nothing until it
> becomes one […] offering a control that silently does nothing would be
> worse than not offering it.

That is the change this makes.

**`align-items: stretch` is both the flex default and what block flow
did**, so a hero that sets nothing lays out exactly as before: children
fill the width and `text-center` still centres the text inside them.

### The padding was the trap

`max-w-3xl py-20 sm:py-28` moved off the class list into the scoped rule,
because a scoped rule outranks a Tailwind utility — left in place they
would have been declared twice with the utility always losing.

The easy mistake, and one nearly made here, is to carry over `py-20` as a
flat `5rem` and lose `sm:py-28` — **quietly shortening every hero on every
desktop**. The responsive half survives as a custom property switched by a
container query, and was verified by measurement at three viewport widths:
112px at 1600, 112px at 700, 80px at 500 — the same three answers
`py-20 sm:py-28` gave.

Since the Hero is now a container it declares `container-type` and
therefore measures **itself** rather than the window. At the top level
those are the same question, because the hero fills the content column;
nested in a narrow track it is the better one, which is ADR-0047's whole
argument.

### An eyebrow, and where it came from

`themes/docs-showcase` had hardcoded a pill above its hero title, with a
comment explaining it was "a fixed design element of this theme, not
editor-controlled content". That was the right call while core had no
field for it and the wrong one now: the theme's badge became the
**default** for an `eyebrow` field, so an editor typing there sees it
appear rather than typing into nothing.

### The Button

Icon, three sizes, full width, and open-in-new-tab; plus `outline`,
`ghost` and `link` alongside the existing `secondary`.

`inline-flex` rather than `inline-block`, because an icon and a label have
to align on their centres — with no icon the result is identical. Sizes
are custom properties whose medium value is exactly the padding the block
had before sizes existed. `openInNewTab` is a boolean rather than a free
`target`, because the only value anyone wants is a new tab and letting it
be free means letting it be wrong; `rel="noopener"` travels with it and is
not optional.

**`ghost` was already declared by `themes/docs-showcase`.** A theme may
add a look but not redeclare a core one (ADR-0048's additive rule), and
`blocks.spec.ts` failed the moment core claimed the name. Declaring moved
to core; the theme's `.kometio-button--ghost` rule stayed exactly where it
was, because what a look LOOKS like was always the theme's business. The
theme now declares `gradient` instead — a look genuinely its own, and one
core has no business shipping.

### The header and footer get a real palette

It had eleven blocks and no button at all: a call to action in a header
meant using a `NavLink`, which is a menu item and reads as one. It also
had no layout blocks, so header and footer could only stack in a
`flex-col` — two columns in a footer were not expressible.

Added: `Button`, `Container`, `Columns`, `Column`, `SocialLinks`,
`SocialLink`, `Divider`, `Spacer`, `Icon`. The same descriptor objects as
the page palette, never copies — a second descriptor for one type would
drift, and a field added to the page's Button would silently not exist in
the header's. There is now an invariant for that, replacing one that
asserted the palette had exactly eleven entries, which was a reminder to
update a number rather than a property worth holding.

## Consequences

**A theme overriding a container has to render `<slot />`**, or every
child block disappears on every site using that theme — silently, since
the page still renders and the blocks are still stored. `docs-showcase`
overrides `Hero`, and its override was written when the block had no
children to lose. `theme-block-override-styling.spec.ts` now derives the
container types from the registry and fails, naming the theme and the
block, when an override drops the slot.

The remaining Fase 4 items — Image, Gallery, VideoEmbed, and layout
variants for Feature/Banner plus a Card that does not exist — are not in
this decision and remain open.
