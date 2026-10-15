# 0141 — A theme says how its site moves

**Status**: Accepted — 2026-10-15.

## Context

The product has had motion since ADR-0060, and a site on it still did not move.
The entrance of a block is a property of one block, chosen by the person
editing, and the answer to "what should this site feel like" was left to
whoever got round to it, block by block. A theme could be quiet, and none
could be anything else: the documentation site, which is the first thing a
visitor sees of Kometio, loaded as a still page, its links changed colour
instantly and one page replaced the next with a cut.

ADR-0060 made one decision that this changes, and it is worth saying which:
"a theme decides how a site looks at rest, not what moves when somebody
scrolls past it". It was written for the entrance of a whole block, and the
reason given holds — a per-type entrance would fire on every block of the type,
and a page of prose would rise paragraph by paragraph. What it did not
consider is the motion that is a block's own (the parts of a hero arriving,
the cards of a grid, a button under the finger) and the motion between two
pages. Those are a look, and a theme is what decides a look.

## Decision

- **Whole blocks still enter per instance (ADR-0060), and nothing here changes
  that.** What a theme gets is the motion inside a block and between pages.
- **Motion is tokens, and a block opts in with markup.** Core defines a
  vocabulary in `:root` (`--kometio-motion-duration-fast|-|slow`,
  `-ease`, `-distance`, `-reveal`, `-stagger`, `-lift`, `-press`), every one of
  them defaulting to "as it was". A theme restates the ones it changes, as
  it does its colours.
- **A block marks the parts that arrive in turn**: `data-kometio-reveal="0…5"`
  on a part, `data-kometio-reveal-group` on a container whose children arrive
  one after the other. The Hero marks its eyebrow, title, subtitle and
  buttons; a collection in a grid arrangement and a list of pages mark their
  items. A theme's own override marks its own parts, which is why this is not
  a selector in core: the docs theme's hero is not core's.
- **Every control has a transition**, from core, on `a`, `button`, `summary`
  and form fields: colour, background, border, shadow, opacity and transform
  in `--kometio-motion-duration-fast`, in a layer a block's own `transition`
  outranks. The outline is not among them, since a focus ring that fades in is
  a focus that is not there for a moment.
- **A card that is a link rises and a button sinks**, by `--kometio-motion-lift`
  and `--kometio-motion-press`, both zero by default.
- **Pages can cross-fade**: `pageTransitions: true` in `theme.json`, as
  `stickyFooter` is. It is a cross-document view transition
  (`@view-transition { navigation: auto }`), so nothing runs in the page and a
  browser without it simply cuts; the header and the footer are named so that
  they stay where they are while the content changes.
- **It fails to "no motion", never to "no content".** Every rule that can leave
  a part on a first frame of `opacity: 0` hangs off `.kometio-motion-ready`,
  which JavaScript adds, and off a root block, which is the only thing ever
  told it has arrived: a part marked in a region or on the search page is
  simply visible. With JavaScript off, in the editor's canvas (a block being
  edited does not make an entrance) and in print, nothing waits.
- **`prefers-reduced-motion` is answered everywhere it is asked.** The reveal
  and the view transition are dropped outright, not shortened, since a part
  held on its first frame would be invisible; a card is not lifted; the rule
  for page transitions is not emitted for such a reader at all.
- **Opacity and transform only**, as for the entrance, so that none of it can
  move what is below it. A spec says so for the properties a control
  transitions, and for the page transition's keyframes.

## What this does not do

- **No motion by default for a theme that says nothing**: `classic` and every
  uploaded theme look and behave as they did. Only the links and the controls
  take the (short) colour transition, because that is what a control does.
- **No entrance of whole blocks by theme.** A theme that wants it can still
  ask the person editing to set it, as before.
- **No JavaScript router.** A site that wants an app-like navigation is a
  different product.
- **No scroll-linked effects** (parallax, progress): they are the kind of
  motion most often unwelcome and hardest to make accessible.

## Consequences

- `global.css` carries the vocabulary, the reveal rules, the control
  transitions and the reduced-motion and print rules; `page-transition-css.ts`
  is what a theme with `pageTransitions` adds to the page.
- The entrance keyframes read `--kometio-motion-distance` (24 px unless a
  theme says otherwise), so a quieter theme's per-instance entrances are quieter too.
- The docs theme says how it moves (`theme.css`, `theme.json`), marks its own
  hero, and gives its sidebar and pager an end state under the pointer.
- The first-run browser test puts the docs theme on the installation it
  spends, and samples the title on its way in, with and without a reader who
  asked for less, and the transition between two pages — against the built
  site and its CSP, which is where the entrance once failed unseen.
