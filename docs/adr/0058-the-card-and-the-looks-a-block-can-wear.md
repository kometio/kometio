# 0058 — The Card, and the looks a block can wear

**Status**: Accepted — 2026-09-08

## Context

Fase 4 of the preparatory plan lists eight items. Seven are done:
`stylableProperties` for every block
([ADR-0051](0051-every-block-is-stylable.md)), the arrangement engine
([ADR-0052](0052-collection-arrangement-as-a-value.md)), the elementary
blocks ([ADR-0053](0053-essential-blocks-and-brand-icons.md)), hosted
media ([ADR-0054](0054-hosted-video-and-audio.md)), reachability
([ADR-0055](0055-a-block-nobody-can-insert.md)), the Hero and the Button
([ADR-0056](0056-the-hero-holds-blocks-and-the-button-grew-up.md)), and
the picture blocks (ADR-0057).

The seventh is this one, and it has two halves.

**Layout variants for Feature and Banner.** Both blocks had exactly one
look and no way to ask for another. `Feature` was `text-align: center`,
written into the block, with the icon above the words: right for a row of
three short features, wrong for a paragraph of prose, and wrong for the
icon-beside-the-text list that appears on roughly every product page.
`Banner` was a centred stack — title, text, button underneath — which
meant the call-to-action _bar_, words on one side and button on the
other, was a shape this CMS could not make at all.

**A Card block that does not exist.** The card is the unit a grid of
things is made of, and there was no block for it. What people did instead
was a `Container` with a border set on it, which gets close and then
fails on the one thing that makes a card a card.

## Decision

### The Card is a container, and its picture is a field

`Card` holds blocks. A heading, a paragraph and a Button already do those
three jobs well, and a Card carrying its own copies of them would be a
fourth, worse one — it could never grow a price, a rating or a badge
without a new field being added to core first. Everything a card contains
is a block, which also means everything inside a card is already
stylable, translatable, searchable and inline-editable, with no new code.

Its **media header is a field**, and that is the one exception. It is not
a convenience: it is the thing a generic container cannot express. A card
holds its words away from its border with padding, and the picture has to
be flush to that border and clipped by the card's own corner radius.
A child block sits _inside_ the padding by definition — that is what
padding is. Escaping it is something only the card itself can do.

So the block is:

- `media` / `alt` / `isDecorative` — Image's own trio, deliberately the
  same three fields obeying the same WCAG rule, so what an author learns
  on one block holds on the other;
- a slot for everything else.

`alt` is indexed by search for Image's reason. The rest of a card indexes
itself, being blocks.

### The Card does not link

The most common card on the web is clickable, and this one is not. That
is a decision, not an omission: wrapping arbitrary children in an anchor
puts buttons and links inside a link, which is invalid HTML and hostile
to a keyboard and a screen reader. The CTA belongs to a Button child —
which since ADR-0056 has icons, sizes, four variants and a full-width
mode. The "stretched link" trick that avoids the nesting needs an
accessible name to attach itself to, and a container with no title field
has none to offer.

### Presentation is a variant, never a prop

Every look added here is a variant ([ADR-0048](0048-what-a-theme-may-do-to-a-block-data-contract.md)),
because a variant is the thing a theme can restyle, extend or refuse
without touching content, and a prop is not:

| Block     | Variants                                                |
| --------- | ------------------------------------------------------- |
| `Card`    | `elevated`, `flat`, `horizontal`                        |
| `Feature` | `inline` (icon beside the words), `start` (ranged left) |
| `Banner`  | `split` (the call-to-action bar), `outline`             |

Each is a class on the block's root element and a rule in the block's own
stylesheet. Nothing about the **markup** changes with the variant —
`Banner` emits its body wrapper and its actions wrapper in every variant,
including the ones that do not need two boxes. A structure that changes
with the look is a structure a theme override cannot rely on.

### Three details worth writing down

Each of these is a defect this codebase has already met once.

**A card's gap is not the gap between its header and its body.** The card
is a flex column of two children — the picture and the padded body — so
the `gap` style property applied to the card itself would open a stripe of
card background between a picture and the words it belongs to. The
override lands on the **body**, where the blocks that a gap is actually
about live. `contentAlign` is moved for the mirror-image reason: aligning
the card would shrink the media header away from the edges, which is the
one thing the header exists to do.

**`var(--shadow-md)` alone would have shipped a shadowless card.**
`classic/theme.css` defines that token and `docs-showcase/theme.css` does
not. A `var()` that resolves to nothing makes the whole declaration
invalid — no error, no warning, an `elevated` card that looks identical to
a flat one on one of the two themes in this repository. Every token
reference in a new rule carries a literal fallback.

**A container block cannot query itself, and half a rule set can end up
asking a different element than the other half.** Both folds here — the
horizontal card and the split banner — were first written as
`@container (max-width: …)`, and both were wrong in the same way. An
element never queries itself: `.kometio-card` declares `container-type`
(required, see Consequences), so a query on `.kometio-card--horizontal`
resolves against the card's **ancestor** while a query on
`.kometio-card__media`, written inside the same `@container` block,
resolves against the **card**. Two rules meant to fire together, decided
by two different widths. A card in a three-column grid inside one wide
container would have kept its row direction while its picture had already
switched to the stacked sizing.

Both folds are `flex-wrap` with a flex-basis minimum instead. That asks
the only question that matters — do these two boxes fit on one line of
**this** element — at the element's own width, with no breakpoint chosen
in advance and no container to get wrong. `container-query-scope.spec.ts`
fails, naming the block, when a container block's own stylesheet puts a
rule for one of its inner elements inside an `@container` block.

The Fase 3 rule still holds where a query is right: the condition takes a
literal, never a `var()`, which resolves too late and never matches.

## Consequences

- 52 insertable blocks, up from 51, and seven new looks across three of
  them. Two of the three blocks changed had no variant at all before.
- `Card` joins the `container-type` list in `global.css` — required, not
  optional: a block nested in a card whose ancestor did not declare it
  would have had every per-breakpoint style silently inert
  ([ADR-0047](0047-canvas-styling-architecture.md)). `container-type.spec.ts`
  fails by name when a container block is added without it, and did.
- `Feature` and `Banner` gain style properties their new variants make
  real — `gap` on both, and the border trio on `Banner`. A control is
  offered when the block's own CSS applies it and not before, which is
  ADR-0051's rule.
- The media header crops at a fixed 16/9. The aspect-ratio vocabulary
  arrives with ADR-0057's media blocks; a second private copy of it here
  would be the duplicate that goes out of step. What a row of cards needs
  is that they all crop the _same_ way, which a fixed ratio gives.
- Fase 4 is closed. Fase 5 (reusable sections) is next.
