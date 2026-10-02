# 0049 — Content width and block alignment

**Status**: Accepted — 2026-09-08

## Context

Every page of every Kometio site rendered its blocks inside one element:

```astro
<main id="main-content" class="mx-auto flex max-w-5xl flex-col px-6">
```

`max-w-5xl` is 64rem. It was written in
`apps/public-site/src/components/PublicPageContent.astro` — core — and it
applied to every block of every page of every site, on every theme.

Three separate problems came out of that one line.

**A theme could not change it.** A theme owns its header, its footer and
its content shell ([ADR-0043](0043-theme-regions-and-the-publishable-theme-surface.md)),
but this constraint sits _inside_ the slot `ContentShell` wraps. A theme
could set its shell to any width it liked and the content stayed 64rem
regardless. The one number that decides how a site reads was the one number
no theme could touch.

**A site could not change it either.** There was no setting. Two sites on
the same theme could differ in colour, font, radius and shadow, but not in
the width of their text column.

**And no block could escape it.** A hero, a full-bleed image band, a
coloured call-to-action section: every one of them stopped at 64rem with
24px of blank page either side. A constraint on a common ancestor is one no
descendant can opt out of — the only way out is not to put it there.

Fase 2 ([ADR-0047](0047-canvas-styling-architecture.md)) took the style
vocabulary from 7 properties to 21 and the theme tokens from 23 to 53. None
of it reached this, because this was never a style: it was structure,
hardcoded.

## Decision

**The width constraint moves off `<main>` and onto a per-block wrapper,
where a block can decline it.** This is WordPress's `alignwide`/`alignfull`
model, and it is chosen because it is the one people already know.

### Three levels, in a cascade

| Level     | Where it lives                           | Who sets it            |
| --------- | ---------------------------------------- | ---------------------- |
| **Theme** | `--kometio-content-width` in `theme.css` | the theme author       |
| **Site**  | `sites.theme_content_width` (Tier 1)     | whoever edits Style    |
| **Block** | `Block.align` — `content`/`wide`/`full`  | whoever edits the page |

The theme states the width it was designed around. The site may override it
from Style settings. An individual block may then claim more room than
either allows.

This mirrors the three tiers the styling model already has, so there is one
shape to learn rather than two.

### `align` is a field of the block, not a style property

`maxWidth` already exists as a per-instance style property, and putting
alignment there would have been less code. It is deliberately not there,
for two reasons.

The first is the one [ADR-0048](0048-what-a-theme-may-do-to-a-block-data-contract.md)
gives for `variant`: three named levels are something a theme can be
designed around, where an arbitrary length is not.

The second is specific to this decision, and it is the stronger one. A
style property is gated by `site.themeSettings.overridesEnabled` and by the
theme's `allowStyleOverrides` ceiling
([ADR-0021](0021-site-theming-filesystem-packages-and-style-settings.md)). Those two switches mean _"show me the
theme's own look again"_ — they are about colour, font and radius. Had
alignment been a style property, flipping either one would have pulled
every full-bleed section on the site back into a 64rem column: a switch
about **appearance** silently re-flowing the page's **structure**. A block's
alignment answers to neither gate.

The site's `contentWidth`, by contrast, IS gated by both — and that is
correct: the theme's own column width is exactly the kind of thing "show me
the theme again" should restore.

### `content` is stored as the field's absence

The default is written as no `align` field and no `data-kometio-align`
attribute, rather than as an explicit `"content"`. Two ways to express the
same page is how the canvas and the served page come to disagree — and it
keeps the published HTML of pages that never asked for this exactly as it
was.

### Numbers chosen for parity, not taste

`--kometio-content-width: 64rem` with `--kometio-content-gutter: 1.5rem` on one
border-box element reproduces `max-w-5xl px-6` exactly: 1024px outer, 976px
of content inside 24px gutters. Verified in a real browser against the
built site, not reasoned about — every existing page renders identically.

`wide` resolves to `max(--kometio-content-width-wide, --kometio-content-width)`
rather than the wide token alone. The wide tier belongs to the theme while
the content width can be raised by the site, so a site widening its column
past its theme's wide tier would otherwise make "wide" render _narrower_
than the default it exists to exceed — silently, and only on the sites that
customized the number.

## Consequences

The canvas bridge had to learn that the wrapper exists. It did not, and
three of its DOM operations were wrong before this — insert nested a block
inside its neighbour's wrapper (or appended one with no wrapper at all),
remove left an empty wrapper still holding its gap, and reorder moved every
block into the first wrapper and emptied the rest. They had been invisible
because the wrapper only carried spacing; carrying the width made them
obvious. `preview-bridge-client.spec.ts` now pins all three, and the
wrapper is built in one place (`root-block-layout.ts`) that both the page
renderer and the bridge use, because two copies of a structure is how they
came apart.

Re-spacing after an insert or a delete needs to know whether a gap is the
default one or a value somebody typed. A canvas-only
`data-kometio-gap="default"` marker says which, so the bridge only ever
changes what it is allowed to change.

The header and footer lists have no such wrapper — they space their blocks
with a flex `gap` — so alignment is offered on the page's own blocks only.

`marginTop`/`marginBottom` remain an inline style on the wrapper, still
base-size only, as ADR-0047 left them. Reworking that into real rules
belongs with the columns work, which touches the same element.
