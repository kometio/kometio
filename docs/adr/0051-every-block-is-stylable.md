# 0051 — Every block is stylable

**Status**: Accepted — 2026-09-08

## Context

[ADR-0022](0022-component-and-instance-style-overrides.md) gave blocks a per-type and
per-instance style override, and [ADR-0047](0047-canvas-styling-architecture.md)
took the vocabulary from 7 properties to 21. Both only ever reached blocks
that declared `stylableProperties`.

**Twenty of the fifty-one did not declare it**, and the list is not the
long tail anyone would guess: `Nav`, `NavLink`, `NavDropdown`,
`HamburgerMenu` — every navigation block a header is built from — plus
`Image`, `Gallery`, `ImageSlider`, `Table`, `Link`, `Callout`,
`SearchBox`, `NewsletterSignup`, `Breadcrumb`, `LanguageSwitcher`,
`VideoEmbed`, `MapEmbed`, `BeforeAfter`, `TimelineStep`, `BackToTop`,
`WhatsAppButton`.

A site owner could restyle a Button and not a menu link. The space between
nav items was `1rem`, the space between gallery thumbnails `0.5rem`, the
newsletter box `24rem` wide — all fixed in a component file, none of them
reachable from the editor or from a theme.

## Decision

All fifty-one blocks are stylable. The property set is chosen per block
rather than applied uniformly, under one rule:

> **A block declares a property only if its own CSS applies it.**

Declaring `backgroundColor` on a block that never paints one produces a
control that does nothing when used — the silent no-op ADR-0047 exists to
prevent, and exactly the defect [ADR-0050](0050-columns-container-and-the-colour-vocabulary.md)
found in `Container`'s padding, where a Tailwind class beat the override on
specificity for as long as the block had existed.

That rule decides several non-obvious placements:

| Block                          | Where the override lands               | Why                                                                                                      |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NavDropdown`, `HamburgerMenu` | the **panel**, not the wrapper         | the wrapper is a positioning context with no appearance; styling it would change nothing visible         |
| `Table`                        | the **cells**, not the scroll box      | padding and borders are what "styling a table" means; on the wrapper they would only inset the scrollbar |
| `VideoEmbed`, `MapEmbed`       | `ConsentGatedEmbed`                    | neither block has a root element of its own — the gate _is_ their root                                   |
| `Image`, `ImageSlider`         | the frame, with the radius passed down | a rounded frame around square corners is not what rounding means                                         |

Every fallback is the value the block already rendered, so a page nobody
has styled is unchanged. That is checked mechanically rather than by
reading: 70 declarations were diffed against the literals they replaced.

## Consequences

**Two blocks were saved from a real regression by measuring rather than
reasoning.** `global.css` gives a bare `<a>` `text-primary`, and names the
`Link` block in its comment for why. A scoped rule in a block outranks that
layer, so the obvious `color: var(--kometio-override-text, inherit)` turned
every `Link` and every `NavLink` the colour of its surrounding text. Both
now fall back to `var(--primary)`. Nothing in the test suite saw it; a
before/after read of computed styles against the built site did.

**A theme's own default now reaches further than it did.**
`themes/docs-showcase` deliberately declares `--kometio-override-radius:
var(--radius)` at `:root`, so that every block reading that variable
inherits the theme's corner radius rather than its own literal. Four blocks
join that mechanism here — `BeforeAfter`, the consent-gated embeds, and the
two menu panels — and go from an 8px radius to the theme's 16px on that
theme. That is what the mechanism is for, and it makes the theme more
coherent, but it is a visible change on an existing site. `classic` does
not declare the variable and is unaffected.

**A theme override has to keep up.** `themes/docs-showcase` replaces
`LanguageSwitcher`, and a replacement that swallowed `instanceClass` would
make styling that block silently do nothing for every site on that theme.
`theme-block-override-styling.spec.ts` already guarded this and failed by
name — the invariant did its job on the first block that needed it.
