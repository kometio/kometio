# 0048 — What a theme may do to a block's data contract

**Status**: Accepted — 2026-09-07

## Context

[ADR-0047](0047-canvas-styling-architecture.md) makes variants a
first-class concept and requires that a theme be able to add variants to a
**core** block — a designer hands over twenty button styles, and today the
only way to have them is a duplicate `MyButton`, because
`findCoreBlockTypeCollisions` (`libs/block-sdk/src/lib/core-block-types.ts`)
rejects a theme block named like a core one.

Lifting that restriction raises the wider question: **how much of a core
block may a theme redefine?**

The case for "everything" is real and was argued: maximum freedom for
agencies and developers is what makes people want to build, a fence is what
stops a CMS being adopted, and a future theme marketplace lives or dies on
what theme authors can express. A theme must be able to take the button and
make it square, flat, borderless — unrecognisable.

**It already can.** That freedom exists today and nothing in ADR-0047
touches it. The confusion worth dissolving is that two different things are
being called the same:

|                   | What it is                            | Who owns it                      |
| ----------------- | ------------------------------------- | -------------------------------- |
| `Button.astro`    | markup and CSS — how it looks         | the **theme**, entirely, already |
| `button.block.ts` | which fields exist and what they mean | the **content**                  |

"A theme arrives and does whatever it wants with the buttons" is entirely
the first row. A theme can already override a block's `.astro` wholesale
(ADR-0021), with its own markup and its own CSS.

The descriptor is a different object. It does not describe appearance; it
describes that **a button has a label and a destination**. It is the
contract over data the customer has entered.

### Why owning the contract is expensive

`Site.themeName` is switchable at runtime (ADR-0042) — there is a dropdown
in the editor. So consider the marketplace this is meant to enable:

> A site has 40 buttons. The owner buys a theme and tries it. The theme has
> renamed `label` to `text`. **The 40 buttons go blank.** They don't like
> it and switch back — but the moment anything was re-saved under the new
> theme, some rows hold one shape and some the other, and neither theme can
> read both.

A theme marketplace does not fail from too many constraints. It fails like
that: **if trying a theme costs a content migration, nobody tries a
second one.** Descriptor stability is not a fence around theme authors — it
is what makes a second theme purchasable.

There is also a direct precedent in this repository. The full-shell
override let a theme copy `PageLayout.astro` wholesale; the copy diverged
in silence and produced four real defects that no check could see. It was
removed for exactly this reason ([ADR-0043](0043-theme-regions-and-the-publishable-theme-surface.md)).

## Decision

**Additive, not destructive.** A theme may:

- ✅ rewrite **markup and CSS** completely — unchanged, unlimited
- ✅ **add** variants, as many as it likes, with arbitrary CSS
- ✅ **add** fields to a core block (an icon, a size)
- ✅ **hide** a variant or a field its design does not use — the value stays
  in the database and reappears if the site returns to another theme
- ❌ may **not rename** a field
- ❌ may **not retype** a field

"Retype" means changing the stored shape. `Image.media` holds
`{ mediaId, url, width, height }`; a theme deciding it should be a plain
URL string means the renderer writes `[object Object]`, and worse, the
moment the customer re-saves that image the value genuinely becomes a
string — so half the content has one shape and half the other, and neither
theme can read both. The damage is not undone by switching back.
`isDecorative` moving from boolean to a `'yes' | 'no'` select is the same
class of change: the stored `false` is not `'no'`.

"Rename" is the quieter version: a theme preferring `altText` to `alt`
leaves 200 images with empty alternative text — no error, no warning,
accessibility and SEO gone until someone notices months later.

The principle in one line: **a block's props are the customer's content;
the theme is a view over that content.** A theme decides how the content
looks, not what it _is_ — for the same reason a stylesheet does not decide
which words are in an article.

No case was found that requires destructive redefinition:

- _"I want `flat | raised | ghost`, not `primary | secondary`"_ — add the
  three, hide the two. Identical result.
- _"My button never links externally"_ — ignore `url` when rendering. The
  field stays in the data, invisible.
- _"I want a fundamentally different button"_ — that is a **new block
  type**, which is already allowed.

### The collision guard

`findCoreBlockTypeCollisions` stays for **new types** — a theme still may
not name its own block `Button`, which is why it exists. What replaces it
for variants is a separate, declarative extension surface (a theme file
that _adds_ variants to an existing type) rather than a redefinition.

### The door left open

If a theme author one day genuinely needs to retype a field, the way
through is not to remove the rule but to attach responsibility to it: the
theme must also supply the **migration function** that converts existing
content, the way a database migration does. Freedom stays available; its
cost sits with whoever chooses it.

**This is deliberately not built now** — only when somebody actually asks.

## Consequences

- Switching themes stays reversible, which is the precondition for the
  marketplace this rule was questioned in the name of.
- The rule needs **enforcing**, not just documenting: theme block sets are
  already validated (`validateThemeBlockSet`), and that validation grows to
  reject a rename or a retype of a core field, naming the field.
- "Hide" must be a real mechanism, not a suggestion — a hidden field
  disappears from the Inspector while its value stays untouched in the
  database.
- Theme authoring documentation must state the rule and, more importantly,
  the reason — a rule whose justification is lost gets argued away later.

## Follow-up (2026-09-07): the extension surface exists

The Decision above promised "a separate, declarative extension surface (a
theme file that _adds_ variants to an existing type) rather than a
redefinition". It is `themes/<name>/blocks/<Type>.variants.ts`, a fourth
file kind beside `<Type>.block.ts`, `<Type>.astro` and
`<Type>.locales.json`.

A separate file rather than an additive `Button.block.ts` on purpose:
`.block.ts` DEFINES a block, so a theme shipping one named after a core
type would be redefining it — the thing this ADR refuses. Adding is a
different verb, and gets a different file.

Three details worth keeping:

- **Labels are strings, not i18n keys.** A theme cannot add keys to the
  editor's bundles at build time, so its strings travel with the data and
  are registered into i18next on arrival, under
  `blocks.<type>.variants.<value>` — the key a CORE variant already uses.
  Downstream nothing has to ask where a look came from.
- **The render path needed nothing.** `BlockRenderer` builds the variant
  class from `Block.variant` alone, so a theme's variant already rendered
  before any of this existed. What the endpoint feeds is the editor's
  picker: without it the look exists in CSS and nobody can choose it.
- **The core-aware checks live in each theme's own spec**, not in the
  runtime loader: `apps/public-site` cannot import
  `@kometio/block-registry`. `CORE_BLOCK_VARIANTS` in block-sdk carries what
  those checks need, kept honest by block-registry's own
  `core-block-types.spec.ts` — the same arrangement `CORE_BLOCK_TYPES`
  already had, and for the same reason: a theme has to be buildable
  outside this monorepo.

## Amendment 2026-09-29: a replacement may leave looks out, and says so

A theme's `blocks/<Type>.astro` replaces the core block completely — a
Hero that is a slider is the theme's to draw, and that freedom stays.
What it could not do was leave one of the block's looks out and have the
editor know: the picker lists every core variant on every site, so a
look the replacement did not draw was a choice that drew nothing.
docs-showcase's Button had dropped Outline and Link that way, silently.

The additive rule gets its one subtraction, declared in the same file
that adds: `blocks/<Type>.variants.ts` may export `hides`, core looks
this theme's block does not have, and the editor removes them from the
picker for sites using the theme (`GET /api/themes/current/block-variants`
now answers `{ variants, hidden }` per type). A stored page wearing a
hidden look renders in the block's default look, as it already did.

Two checks keep it honest, both in block-sdk and run from each theme's
own spec: `checkVariantsAgainstCore` refuses hiding a look the block does
not have, and `checkOverridesDrawVariants` refuses a replacement that
neither draws a core look (`.kometio-<type>--<look>`) nor hides it.
