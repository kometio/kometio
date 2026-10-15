# 0142 — The owner can say a site does not move

**Status**: Accepted — 2026-10-15.

## Context

ADR-0141 gave a theme the means to say how a site moves, and the docs theme
says it. That left a person with a site on such a theme one way out: pick
another theme. The product already answers a reader who asked their system
for less motion, and that is the reader's choice; what was missing is the
**owner's**. A studio whose clients do not want anything to move, a site for
people who find motion tiring, a brand that is simply still — none of them
should have to change how the site looks to get that.

It is also the one thing the owner could not ask for at all in the other
direction: entrances somebody set on a block are the owner's own choice, and
turning them all off meant opening every block.

## Decision

- **A site setting, `motionEnabled`, on by default.** It is one more field of
  the site's theme settings (`themeSettingsSchema`), stored as
  `sites.theme_motion_enabled boolean not null default true` (migration 0016),
  so every site that existed moves exactly as it did. In the Style settings it
  is a section of its own: "Animations and transitions".
- **It is not under the two gates ADR-0021 describes.** The site's "apply
  these settings" switch is "show me the theme's own look again", and a theme's
  `allowStyleOverrides: false` is "nobody dresses me". Neither is a statement
  about stillness: a site that turned motion off has not asked to see the
  theme's colours, it has asked for stillness, and a theme author's ceiling on
  colours is no reason to keep moving. `resolvePageThemeStyles` returns it
  as it is saved, and a spec says so for both gates.
- **Off is the answer of a reader who asked for less, given to everyone.**
  `PageLayout` puts `data-kometio-motion="off"` on `<html>`; `global.css`
  carries the same rules as its `prefers-reduced-motion` block under that
  attribute (the whole entrance dropped, not shortened; no lift, no press, no
  sliding page), and the page transition's rule is not emitted at all. A spec
  compares the two blocks rule by rule, so the copy cannot drift.
- **Scripts ask one question.** `motion-preference.ts` answers "does this
  page hold still" for the entrance, the count-up of a stat and every smooth
  scroll, where there used to be three copies of the same media query. The
  Marquee, which is the block whose whole job is to move, stands still and
  wraps, as it does for a reader who asked.
- **The canvas follows the site.** Somebody who turned motion off sees no
  entrances in the canvas either: the canvas is where they check what a visitor
  will see.

## What this does not do

- **It is not per page and not per block.** A block's own entrance is still
  chosen on the block; the switch turns them all off at once, and turning it on
  again gives back what was chosen.
- **It does not stop what a visitor starts**: a video they press play on, a
  carousel they scroll.
- **It does not touch the editor's own interface**, which has its own, short,
  state transitions (editor DESIGN.md).

## Consequences

- One column, one field in the API (`themeMotionEnabled` on the record,
  `motionEnabled` in the settings), and a switch in the Style settings.
- `IntegrationsView` round-trips the field with the others it does not own,
  as it does `overridesEnabled`.
- The first reader of the site's own source can ask for it in CSS:
  `html[data-kometio-motion='off'] …` (themes/README.md).
