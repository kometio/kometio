# 0060 — Motion, and asking the reader first

**Status**: Accepted — 2026-09-08

## Context

Fase 6 of the preparatory plan is animation, and the product had none:
no entrance animation, no hover state a page could ask for, and — the
part that is not a missing feature but a defect — **not one
`@media (prefers-reduced-motion: reduce)` block anywhere**, while
shipping three CSS transitions and four smooth scrolls.

For a reader with a vestibular disorder those are not decoration. Motion
they did not ask for is a reason to close the tab, and the operating
system already carries their answer. Ignoring it is the accessibility
failure here; the missing animations are merely the missing feature.

## Decision

### Animation is a style property, on the wrapper, per instance

Four properties — `animation`, `animationDuration`, `animationDelay`,
`animationEasing` — plus `hoverEffect`, join `marginTop`/`marginBottom` as
**instance-only, root-block-only** values.

Instance-only for the margins' reason, and one of its own: what animates
is the WRAPPER around a root block, the only element that exists once per
placement. A per-TYPE entrance animation would fire on every block of that
type anywhere, including the six inside a `Columns` that are already
arriving with their parent.

Being ordinary style properties, they inherit everything Fase 2 built —
the editor's controls, the value barriers, the per-instance CSS layer —
without a line of new plumbing.

**Base only, no per-breakpoint tiers.** An entrance is not a layout, and
the breakpoints are about layout. The size at which motion genuinely has
to change is not the viewport, it is whether the reader asked for less of
it, and `prefers-reduced-motion` answers that on its own.

### A closed list of animations, and only opacity and transform

The value is one of `fade`, `slide-up`, `slide-down`, `slide-left`,
`slide-right`, `zoom` — not a free CSS `animation` string like
`boxShadow` is a free CSS value. An entrance needs keyframes the
stylesheet has to define, so an arbitrary string could only ever name
something that does not exist.

Every one of them moves **`opacity` and `transform` and nothing else**.
Those are the two properties a browser animates on the compositor without
laying the page out again, so an entrance cannot push the content below it
around while it plays. An animation that moved a height or a margin would
be a Cumulative Layout Shift on a site's most visible content — the plan
flagged this, and it is why the distances are 24px and 8% rather than a
flight in from the edge of the screen.

`entrance-animation-css.spec.ts` fails, naming the animation, when a value
is added to the vocabulary with no keyframes to match. `animation-name`
pointing at keyframes nobody defined is not an error: CSS drops the
declaration and the block silently never animates — the same shape of
silence as a `@container` query with no container, which is a test for the
same reason.

### The mechanism fails to "no animation", never to "no content"

The first frame of every entrance is `opacity: 0`. That makes the order of
operations a correctness question rather than a detail.

`entrance-animation.ts` puts `.kometio-motion-ready` on `<html>` **before**
observing anything, and every animation rule in `global.css` hangs off
that class. With JavaScript off, or before the module has run, no rule
matches and every block is simply visible. The opposite arrangement —
animate by default, release with JavaScript — hides an entire page from a
reader without JavaScript, and from every reader during the gap before the
script arrives.

The same reasoning covers a browser with no `IntersectionObserver`: the
class is never added, so nothing can be left waiting for a callback that
will not come.

Within that, `animation-play-state: paused` plus `animation-fill-mode:
both` holds a block on its first frame until the observer says it has
arrived. Adding the animation on entry instead restarts layout and flashes
the first frame at full opacity on a slow machine.

The observer `unobserve`s each element on arrival — the pattern `stat.ts`
already had right, generalised. An entrance replayed on every scroll past
is a page that will not sit still.

### `prefers-reduced-motion` is answered in CSS _and_ in JavaScript

Both, and neither is redundant.

The CSS blanket rule collapses every animation and transition to `0.01ms`
and drops the entrance outright, with `!important` and a `*` selector so
it beats a per-instance rule in `@layer kometio.instance`, a theme's
stylesheet and a block's scoped style alike. A reader who asked the
operating system for less motion is not overridden by a site's design.
`0.01ms` rather than `none` because an animation that never runs never
fires `animationend`, and code waiting on that event would hang.

The JavaScript checks the same query and returns before observing
anything — which is what makes the entrance genuinely absent rather than
instant, and saves an observer nobody needs.

And **an explicit `behavior: 'smooth'` is a JavaScript argument, not a CSS
declaration**: no stylesheet can override it, so
`scroll-behavior: auto !important` does not cover the four calls the
product already had. `preferredScrollBehavior()` asks on every call —
never caching, because the setting can change while the page is open.

### Hover is an attribute, animation is a custom property

The animation set is emitted as custom properties, so the `animation`
shorthand lives once in `global.css` where it can be paused and dropped.
The hover effect is emitted as `data-kometio-hover` on the wrapper instead:
an effect is two declarations and a transition, not one value, so there is
nothing a custom property could hold — and CSS cannot select on a custom
property's value without `@container style()`, which is not yet
everywhere.

## The bug this shipped with, caught only by the served page

The behaviour module had exactly **one import consumer**, so Astro inlined
it into the SSR HTML — and the strict CSP (`script-src 'self'
'nonce-…'`, no `'unsafe-inline'`) blocked it. In a real browser
`.kometio-motion-ready` never appeared and no animation would ever have run
in production. Every test passed; the build looked right; the served page
was the only thing that knew.

This is the gotcha PR #125/#126 documented, met again. The fix is the one
that comment names: a second consumer forces Rollup to emit a shared
chunk. Here that consumer is `init-preview-bridge.ts`, which is not a
trick — a block dropped onto the canvas lands in a wrapper nothing was
observing, and re-running the initialiser is what it needed anyway.

## Consequences

- Motion is available on any root block and off by default. Nothing on an
  existing page changes: with no `animation` set, the shorthand resolves
  to `none` and the rule costs that block nothing.
- The product answers `prefers-reduced-motion` for the first time, across
  CSS animations, transitions, and the four scroll calls that CSS could
  not reach.
- `cssDurationTokenSchema` is narrower than every other length in the
  vocabulary: it refuses a bare `600`. That is not tidiness — a unitless
  number makes the whole `animation` shorthand invalid, which is the
  difference between a wrong look and a block that never appears.
- Still open: **hover states on the blocks themselves** (a Button's own
  hover, a Card's) remain each block's business. What this adds is the
  wrapper's, which is what a page can ask for without a theme's help.
