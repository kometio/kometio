# 0047 — The canvas styling architecture: container queries, cascade layers, variants

**Status**: Accepted — 2026-09-07

## Context

An audit of the visual editing surface, run before planning the WordPress
importer, produced one sentence worth keeping: **the engine is good, the
vocabulary has seven words.**

The engine is genuinely well built — the three-tier style system
(ADR-0021/0022/0035), the preview bridge, the command-pattern undo, the
Block SDK, theme regions (ADR-0043). Nothing here proposes rebuilding any
of it. What it cannot do is _express_ an ordinary marketing website:

- `blockStyleOverrideSchema` has **seven** properties: `backgroundColor`,
  `textColor`, `borderRadius`, `paddingX`, `paddingY`, `marginTop`,
  `marginBottom`. No border, no shadow, no background **image**, no
  overlay, no min-height, no alignment, no max-width, no gap.
- `themes/classic/theme.css` declares **23** custom properties. No link
  colour, no spacing scale, no typographic scale, no shadows.
- The breakpoint selector in the editor sets the **iframe width only**
  (`canvas-frame.tsx`). There is no per-breakpoint styling at all.
- 20 of 51 blocks declare zero `stylableProperties`.

The competitive bar moved this year. **Elementor 4 shipped on 15 April
2026** with a rebuilt architecture: atomic elements with clean markup,
Variables, Classes, Components, and per-device styling on effectively every
property, with Classes and Variables exportable between projects. The datum
that decides the priority order, from the same reporting:

> Elementor has offered per-device styling for a decade, WordPress core
> never has, and that one gap has quietly driven millions of licence
> purchases.

## Decision

### 1. Per-instance overrides stop being inline styles

This is the load-bearing change, and everything else follows from it.

Today a per-instance override is an inline `style` attribute
(`buildBlockInstanceStyle`), and the cascade works by construction: inline
beats the per-type rule, no `!important` needed. It is elegant, and it is
a dead end — **an HTML `style` attribute cannot contain a media query**.
That is not a limitation of our code; it is the language.

So per-instance overrides move to **generated CSS rules keyed by a stable
per-instance class** (`.b-<blockId>`), emitted alongside the per-type rules
the system already produces.

### 2. Cascade layers make the tiers explicit

Once the instance override is a rule rather than an inline style,
`.b-a3f9` and `.kometio-hero` have **identical specificity** and the winner
becomes whichever is emitted last — a fragile detail that someone will
eventually break.

```css
@layer kometio.theme, kometio.class, kometio.instance;
```

A later layer wins regardless of specificity or source order. The tier
model stops being an implicit convention resting on specificity accidents
and becomes one readable line at the top of the stylesheet.

### 3. Container queries, not viewport media queries

Elementor and Webflow drive responsive styling from the **viewport**, and
inherit its defect: a block inside a narrow column, viewed on a wide
screen, receives the _desktop_ styles because the window is wide — and
breaks. This is a familiar failure mode of every page builder.

Kometio uses container queries instead:

```css
@container (max-width: 768px) { .b-a3f9 { … } }
```

with `body` — and every block that can contain children — declared
`container-type: inline-size`.

The elegance is that this needs no new mental model. A root-level block's
nearest container is `body`, whose width tracks the viewport, so it
behaves exactly as a media query would and the user notices nothing. The
same block dropped into a 300px column correctly receives the narrow
styles. Same interface, right behaviour in both cases.

> **Amended during implementation.** This paragraph originally said
> `<main>`, and that was wrong in a way worth recording rather than
> quietly fixing. `<main>` is `mx-auto max-w-5xl px-6`: its inline size
> never exceeds **976px**, so `(max-width: 1024px)` would have matched on
> a 4K monitor and every "Tablet" value anyone set would have applied on
> desktop, always — silently, and with the control appearing to work.
> Measuring `body` also survives Fase 3 making the content column
> configurable, which measuring the column would not.

Checked before choosing it: size container queries reached Baseline Widely
Available in 2024 and sit around 90% global support in mid-2026; the early
gotcha where `container-type` made the element a containing block for
absolutely positioned descendants was **removed by a 2024 CSSWG
resolution**; `container-type: size` collapses height, which is why we use
`inline-size`; and a container cannot style _itself_ — `@container`
affects descendants only, so each level is styled by its parent's width.

**The dangerous property, and the reason for an invariant.** If no ancestor
declares `container-type`, an `@container` rule simply never matches.
No error, no console warning, nothing in devtools marking the rule as
inert. This is precisely the family of defect this codebase keeps meeting —
the double-rendered `ContentShell`, the font declared `'Sora'` against an
`@font-face` named `'Sora Variable'`, the CSS leaking between themes, the
script silently inlined and CSP-blocked. All silent, all found by looking
at real output.

The concrete case here is not hypothetical: header and footer blocks render
inside `<HeaderRegion>` (`PageLayout.astro`), a **sibling of `<main>`**, not
a descendant. Declaring the container on `<main>` alone would leave every
header block's per-breakpoint styling inert — and the agency would have
already seen the mechanism work on a page block minutes earlier, so they
would conclude they had made a mistake rather than that the feature was
broken there.

**The invariant, and it is testable**: the places a block can live are few
and enumerable — the page itself, and every block descriptor with
`isContainer: true`. If each declares `container-type: inline-size`,
coverage is complete by construction. Two tests enforce it
(`apps/public-site/src/lib/container-type.spec.ts`):

1. over the registry — every `isContainer` descriptor's class appears in
   the rule that declares `container-type`, so adding a new container
   block and forgetting fails the build **naming the block**;
2. over the components — each of those classes sits on the **root element**
   of its component, so it is an ancestor of the children rendered inside,
   and none of them is `display: contents` (an element with no box
   measures nothing).

The second was specified here as a check over rendered HTML, walking each
block element's ancestors. It is a check over component source instead:
Vitest has no Astro plugin in this workspace and there is no served-HTML
harness to render a page in a test. The substitute is not a weaker claim —
a class on the component's root element **is** an ancestor of everything
that component renders, which is exactly what walking the ancestors would
have established.

Writing the first of these immediately found a real one:
`HamburgerMenu` is a container, and its root carried `kometio-hamburger`
while the style system generates rules for `.kometio-hamburger-menu`. Nothing
had failed because that block has no `stylableProperties` yet — the
mismatch was waiting for the day it got one.

### 4. Variants are the product primitive; classes are the mechanism

The first draft of this decision proposed **named classes** — free-form
style bundles applied by name. It was revised after a concrete account of
how the work actually arrives: designs come from Figma as components with
variants, sometimes twenty of a single button, and blocks are built on top
of those.

|                     | Free-form class | **Variant**              |
| ------------------- | --------------- | ------------------------ |
| Shape               | arbitrary text  | enumerated               |
| In the editor       | you type a name | **you pick from a menu** |
| Scope               | any block       | that block type          |
| Who uses it         | a developer     | **the client too**       |
| Where it comes from | composition     | **the design file**      |

A free-form class is a developer's tool. A variant is a product concept:
enumerated (the client cannot invent nonsense), typed to the block, and
already the shape in which design is handed over. Classes remain the
mechanism underneath — a variant emits a class, ordered by the layers
above. Only the authoring surface changes.

The concept **already exists, half-built**: `Button` declares
`variant: 'primary' | 'secondary'` and emits `.kometio-button--secondary` —
but both variants are hardcoded in the descriptor and their CSS lives
inside `Button.astro`'s `<style>`. Three gaps close:

1. **Variants become declared**, not conventional: listed in the
   descriptor, with the renderer emitting `.kometio-<type>--<variant>`
   instead of each component doing it by hand.

   > **Where the chosen value lives, decided during implementation.** On
   > `Block.variant`, a sibling of `styleOverride` — **not** in props.
   > Props are the client's content and a theme is a view over it
   > (ADR-0048), so a theme may add a variant or hide one it has no design
   > for and no stored page changes; the block simply renders in its
   > default look. Had it stayed a prop, a theme dropping a variant would
   > leave content pointing at a value that no longer exists, which is the
   > failure ADR-0048 exists to prevent.
   >
   > `Button.variant` moved there. `Callout.tone` and
   > `PricingPlan.highlighted` did **not**, though they emit a modifier
   > class too: they are meaning, not presentation. A warning callout is a
   > warning under any theme, and which plan is recommended is a
   > commercial fact — neither is a design a theme may hide.

2. **A theme can extend a core block's variants.** Today
   `findCoreBlockTypeCollisions` rejects a theme block named like a core
   one, so twenty button variants force a duplicate `MyButton` that loses
   the core Button entirely. See ADR-0048 for the rule that replaces this.
3. **Styling becomes variant-aware**: `site_theme_block_styles` is keyed by
   `(type, variant)` rather than `(type)`. Today's per-type styling becomes
   "the type's default variant", which _unifies_ the tiers rather than
   adding one.

   > The variant column is `NOT NULL DEFAULT 'default'`, never nullable.
   > A nullable column reads more naturally and is wrong here: NULLs do
   > not compare equal, so `(site, type, NULL)` is not a duplicate of
   > itself and the primary key would let one type collect unlimited
   > default rows. `blockVariantNameSchema` reserves the word `default`,
   > so a declared variant can never collide with it. Existing rows took
   > the column default, which is exactly what they always meant.
   >
   > The toolbar's "style every block of this type" paints the variant the
   > SELECTED block wears. Painting the default from a ghost button would
   > have recoloured the primaries and left the button the user was
   > looking at untouched.

**Two levels of authorship**, mirroring the tiering already in the product
(a theme may do anything; a site may do the safe subset):

- **In a theme, in code** — arbitrary CSS: layout changes, pseudo-elements,
  anything. This is the Figma-to-code workflow, untouched.
- **In the editor** — the agency may create variants too, but limited to
  the style vocabulary. No arbitrary CSS.

### 5. The vocabulary itself

`BlockStyleOverride` grows to cover an ordinary website: border, shadow,
**background image** with position/size/repeat, overlay, min-height,
content alignment, `max-width`, `gap`. Theme tokens grow correspondingly:
link colour and hover, a spacing scale, a typographic scale, shadows.

The token vocabulary should be designed with an extractor in mind — the
same values are what "brand capture" will read off a rendered WordPress
page. Deciding which tokens exist and deciding what can be read from a page
are the same question from two sides.

## Consequences

- **A data migration.** The stored shape becomes breakpoint-major —
  `{ base, tablet?, mobile? }` — in JSONB on `Block.styleOverride` for every
  block of every page, and on `site_theme_block_styles.style`. A script
  (`pnpm db:migrate-responsive-block-styles`, modelled on
  `backfill-block-ids.ts`) plus a backward-compatible read: the old shape
  is the new one with only `base`. The read is what makes the feature
  work, so the script does not have to run before the new code — it runs
  so that only one shape is left in the tables, rather than every future
  reader having to handle both forever.
- **Nothing validates a stored style by throwing.** The emitter and the
  database read both tolerate a value today's rules refuse — a row written
  before PR #144 bounded what a declaration may contain — by dropping that
  one property. A `.parse` on either path would answer a bad colour saved
  months ago with a site that does not render.
- **Root-block spacing stays base-only.** `marginTop`/`marginBottom` are an
  inline style on a wrapper whose default depends on the block's position
  in the page, so they are not part of the generated rules. Rather than
  offer a control that silently does nothing, the editor hides those two
  fields at the narrow sizes; Fase 3 reworks that wrapper and can bring
  them back.
- **The editor's live patch grows.** `canvas-editor-shell.tsx` already
  live-patches a `<style>` for per-type rules on save; it must now do the
  same for per-instance rules. Where those rules live in the document, and
  how they are patched into the iframe, is the first thing to design.
- **`stylableProperties` must open.** It was typed
  `keyof BlockStyleOverride` (`theme-blocks.ts`), so a theme could not
  widen the vocabulary — which contradicts ADR-0037 and ADR-0041.

  > **Done.** A theme declares extra properties in
  > `themes/<name>/blocks/<Type>.style.ts`: a key, a control, a label per
  > locale. `blockStyleOverrideSchema` gained a `catchall` so the value
  > can be stored, plus a refinement on the KEY — `catchall` constrains
  > values and says nothing about names, and the name becomes a CSS
  > custom property.
  >
  > The theme does not name that property. `windowTint` becomes
  > `--kometio-override-window-tint`, derived by the emitter: a theme
  > naming its own could point two properties at one variable or collide
  > with a core one, and neither mistake announces itself. Core's names
  > stay a map, because they are not mechanical — `backgroundColor` is
  > `--kometio-override-bg`.
  >
  > The one case the derivation must NOT catch is `marginTop` and
  > `marginBottom`: core keys deliberately absent from that map, applied
  > per instance on a wrapper rather than as a per-type rule. Deriving a
  > name for them would have quietly resurrected them as one, so they are
  > excluded explicitly and a test says so.

- **"Mobile" changes meaning**, and the interface must say so rather than a
  documentation page nobody opens. The selector keeps the familiar words
  with the measurement beside them — `Desktop (>1024px)`,
  `Tablet (≤1024px)`, `Mobile (≤768px)` — so it reads as a size rather than
  a device, with a tooltip explaining that the size measured is the space
  the block has, not the window.
- Someone who sets "mobile: 14px" and later drops that block into a narrow
  column on a large screen will see 14px. That is correct — it is what they
  meant — but it differs from every other builder, so it is documented as
  behaviour, not discovered as a bug.
