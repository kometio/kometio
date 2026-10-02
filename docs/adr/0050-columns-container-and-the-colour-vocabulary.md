# 0050 — Columns, Container, and the colour vocabulary

**Status**: Accepted — 2026-09-08

## Context

[ADR-0049](0049-content-width-and-block-alignment.md) freed the page's
width. What sat inside it was still the narrowest part of the canvas.

**A column could not be resized.** `Columns` offered three presets —
`two-equal`, `two-asymmetric`, `three-equal` — and `Column` had
`fields: []`. Not "resizing is awkward": there was no field to set. A page
could have two equal columns, a 30/70 split, or three equal columns, and
nothing else. A sidebar next to an article, a wide photo beside a short
caption, four small cards in a row: none of them expressible.

**The space between columns was 1.5rem, always**, hardcoded in
`Columns.astro`. So was what happens on a narrow screen: one column below
640px, no choice — and via a `@media` query, asking how wide the WINDOW
was. A row of columns nested inside a narrow track on a wide desktop
therefore kept its columns side by side in 300px. That is the exact defect
[ADR-0047](0047-canvas-styling-architecture.md) exists to remove; this rule
predated it and was never revisited.

**A Container could only ever be a column.** No direction. Its background
was four preset tokens and its padding four preset sizes, both as Tailwind
classes — and `container.block.ts` deliberately left `backgroundColor`,
`paddingX` and `paddingY` out of `stylableProperties` to avoid "two
conflicting mechanisms for the same property".

That reasoning does not survive contact with the CSS. They were never two
mechanisms competing on equal terms: the preset was a class, the override a
declaration on a lower-specificity selector. Setting a padding on a
Container did nothing at all, silently.

**And every colour override in the canvas was a dead hex.** The colour
control is an `<input type="color">`, which can only produce
`#rrggbb`. Every per-block colour anyone had ever picked was frozen at the
value the theme happened to have that day: change the theme, and the
blocks people had styled kept the old palette. The theme token system —
53 tokens, ADR-0047 — was reachable from a theme's CSS and from nowhere
in the editor.

## Decision

### Columns: twelve tracks, and a width per column

`Column.props.span` is a number from 1 to 12. Twelve because it is the
number Bootstrap, the WordPress block editor and every grid system a
designer has already met use.

`span` is **optional**, and that is the useful part. A column that declares
nothing takes an equal share of what the explicit ones left over
(`resolveColumnSpans`), so setting ONE column to 4 makes its neighbour 8 by
itself, and adding a column to an untouched row keeps them all equal with
nothing to keep in sync by hand.

The tracks are emitted as `fr`, which normalises whatever it is given, so
an over-committed row compresses instead of overflowing its container.
Nothing has to add up to twelve for the page to stay intact — and a column
whose share rounds to nothing still gets one track, because a column
rendered at zero width is content that has silently disappeared.

The parent emits the whole `grid-template-columns`, rather than each column
taking `grid-column: span N` of a shared 12-track grid. A track is a
property of the grid: one column's default depends on what the others
asked for, so they can only be resolved together. `Columns.astro` has only
a `<slot/>` and cannot see its children, so `BlockRenderer` resolves the
spans and hands them over.

`stackBelow` (`never`/`tablet`/`mobile`, default `mobile` — what the fixed
rule did) and `verticalAlign` replace the hardcoded behaviour, and the gap
becomes the `gap` style property every other container already had.

The stacking rules are **container queries** now. Their widths are written
out as literals, because a container query's condition may not contain
`var()` — CSS resolves custom properties too late and the rule silently
never matches — so `columns-breakpoints.spec.ts` reads the file back and
fails, naming the number, if either stops matching `BREAKPOINT_MAX_WIDTHS`.

### Container: the preset becomes the override's fallback

`background` and `padding` keep their presets, and gain free values that
beat them. The presets survive because they follow the theme: a Container
set to `primary` re-tints itself when the site changes theme, where a hex
would stay that colour forever.

What changes is the mechanism. The preset is no longer a Tailwind class but
a custom property, so the two live in one declaration:

```css
padding: var(--kometio-override-padding-y, var(--kometio-container-padding)) …;
background-color: var(
  --kometio-override-bg,
  var(--kometio-container-bg, transparent)
);
```

One mechanism, the preset as its starting value, the free value winning
when there is one. `flexDirection` joins as a style property rather than a
prop, so it can differ per breakpoint — a row of cards on a desktop and a
stack on a phone is the most common responsive layout there is.

### The colour picker learns the theme's own palette

Every colour control offers the active theme's colours as swatches. Picking
one stores `var(--primary)`, not the hex it currently resolves to, so a
block painted from the theme keeps following it. The text field accepts a
`var(--…)` as readily as a hex, because a theme may declare colours core
has never heard of.

`themeBaseTokensSchema` grows the rest of the palette to make this possible
— `background`, `foreground`, `muted`, `mutedForeground`, `border`, `link`
— all optional, so a theme that does not declare one loses a swatch rather
than failing to load. `docs-showcase` declares no `--link`: the absent case
is real, and tested.

### Root-block spacing becomes a rule

ADR-0047 left `marginTop`/`marginBottom` as an inline style, base-size
only, because their default depends on the block's POSITION — the last
block gets no gap below it — which no rule emitter knows about. The editor
hid the fields at narrow sizes to avoid promising something that would not
happen.

The default is now `.kometio-root-block:last-child` in CSS, where position is
something a selector knows by construction. The two margins become ordinary
per-breakpoint rules on the wrapper's own class, and the fields are offered
at every size.

This removes code rather than adding it: the canvas bridge no longer
re-spaces neighbours after an insert or a delete, and no longer needs the
`data-kometio-gap` marker that told it which gaps it was allowed to touch.

Our cascade layers are now declared in one place —
`@layer kometio.base, kometio.class, kometio.instance;` — rather than taking
their order from whichever `<style>` the page happened to emit first. The
default spacing rule is a more specific selector than the instance rule
that must beat it, and layers are what make specificity irrelevant to that.

## Consequences

`Columns.layout` is gone from the schema, so stored rows carry a prop
nothing reads. Two of the three presets need no conversion — equal columns
are what a row with no widths does anyway — but `two-asymmetric` rendered
`3fr 7fr` and would silently become 50/50. `migrate-columns-layout.ts`
writes all three out as explicit spans; twelfths cannot express 30/70
exactly, so that one becomes 4/8, the nearest the new vocabulary has. Run
against the development database it rewrote 13 rows.

A numeric field can now declare itself `optional`, so clearing it means "no
value" rather than zero. Without it, emptying a column's width would store
`0` — a number outside the property's own range, looking like a choice
somebody made.

`BlockStyleRegistry.STANDARD` stays what it was; `Columns` spreads it and
adds `gap`, `Container` still declares its own longer list. The registry
covers the common case, not every combination, as its own comment says.
