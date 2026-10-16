# 0139 — Three editorial themes, one at a time: paper, night and colour

**Status**: Accepted — 2026-10-15. `paper` (#120) and `night` (#121) are in;
`colour` is the last, in its own pull request, which amends the table at the end
and adds what is particular to it below.

## Context

The product shipped two themes, and neither was a place to start from: `classic`
is a small business's quiet site, `docs-showcase` is a documentation site. The
starters (ADR-0136) make a studio, a portfolio and a blog in a minute, and all
three of them landed on `classic`, which draws a portfolio as a business.

Three designs were drawn for them (a canvas of the owner's, 15 October):
**Carta** (warm paper, ink, one terracotta accent, a display serif, ruled
lists), **Notte** (dark, one luminous colour) and **Colore** (flat colour,
hard shadows, heavy type). The owner wants all three, as themes with English
names — `paper`, `night`, `colour` — and each looked at, on its own pages,
before it is merged.

## Decision

- **One theme per pull request, in the order of what it asks of core**: `paper`,
  `night`, `colour`. A theme that is looked at as a screenshot and approved is
  a theme that can be merged; three at once would be approved on the strength
  of the first.
- **A theme is tokens, and the three regions, and nothing copied.** `paper`
  began as the `portfolio` theme (a repository of its own, which stays) and was
  redrawn against the design: its values are the design's, measured on it. What
  a token cannot say — a hero set on the left, an index of pages as ruled rows
  with their numbers, a line of text with a measure — is said in `regions/
ContentShell.astro`, which wraps a page's blocks in a box that is not there
  (`display: contents`) and reaches the blocks core renders through `:global()`
  anchored on its own class. It is the way ADR-0043 gives for reaching what core
  draws, and the only one for the list of pages: a block override is a copy, and
  the list's pagination and filter are the public site's own modules, which a
  theme cannot import.
- **A hero's words go where its blocks go.** `text-center` was on the element
  whatever `contentAlign` said, so a hero set on the left had its words in the
  middle of a box on the left. The text now follows `--kometio-override-align`
  (`start`, `center`, `end`), and with nothing set it is the centre it was.
- **The starters say where they sit.** The blog and the portfolio set their
  heroes `start`; the studio is a centred site and says nothing. The blog starts
  on `paper`.
- **A starter whose theme the deployment does not have is not made.** It is
  listed as unavailable, with the theme's name, and refused (`400`, nothing
  written). `KOMETIO_THEME` can leave a theme out and a build can too; a site
  handed another look than the one its pages were written for, without being
  told, would be worse than a starter that says what is missing. The question is
  one function, asked by the offer and by the application.
- **The scale is the design's.** A phone's 56px headline and a window's 112px
  are the ends of one line (`--kometio-h1-size`), and the page grows with a
  large window as every theme's does (ADR-0143). A page that opens with its
  title and nothing else is set at 84px, as the design sets it.
- **The accent is a name of this theme's own** (`--paper-accent`), because the
  ink, not the terracotta, is `--primary` here: the filled button is ink with
  paper letters, as drawn, and the accent is for links and for what is marked.

## What this does not do

- **No italic accent in the title.** The design sets one phrase of the headline
  in an italic accent; a title is plain text, and a phrase in it would be a field
  the Hero does not have. Left out on purpose, not forgotten.
- **The title of a page without buttons is 84px, not 112.** The design does the
  same on its project page, and a long project name needs the difference.

## Consequences

- `themes/paper/` is a package (`theme.css`, `fonts.css` and the font files,
  `regions/Header|Footer|ContentShell.astro`, a `blocks.spec.ts`), registered in
  the workspace like `classic`.
- Three things the design needed from core, each small and useful to every
  theme: a region is given `siteName` (the footer ends on it, set large); a Nav
  link says `aria-current="page"` for its own page and `"location"` for the
  section a page is in, which a screen reader reads and a theme may mark (core
  draws nothing for it); a list of pages says how many entries come before its
  page (`--kometio-page-grid-offset`), so a numbered archive goes on at 11 and
  does not start again at 01.
- The theme's contrast is measured and written down in `theme.css` (ink 14.9:1
  on the paper, the muted ink 5.9:1, the accent 5.2:1).
- axe reports nothing and the page does not scroll sideways on the eight pages of
  block samples, the starter's pages and the code sample, at 1280 and 390.

## `colour`

Flat cream, ink for every line and shadow, three flat colours to put things on
and one accent, Archivo set wide and heavy in capitals, DM Mono for the small
labels. The values are the design's, measured on it (the build is checked
against the design's own page at 1280 and 390: the header, the name, the menu,
the tag, the headline, the cards, the footer come out at the same sizes, to the
pixel).

- **The ink is `--primary`; the accent is the site's secondary colour.** The same
  reason as `paper`'s, stronger: core sets a link, a menu entry and the pager in
  `--primary`, on the ground, and the design's accent on its cream is 2.6:1 —
  which a page nobody styled (the one that is not found, the search) showed at
  once, in axe. So the accent is `--secondary` (`--colour-accent` in the theme),
  which a site can change in Style, and it fills what is pressed or marked and
  is never a colour to read in.
- **A page that opens with its title opens with a band.** The accent runs to
  both edges of the window with a 3px rule under it, and the landing's hero has
  the rule alone. It is drawn with a shadow as wide as the window, a border whose
  image is let out to both sides and a clip; none of them is part of the page's
  width, which a `100vw` box or an absolute one pushed past the edges is (the
  first version scrolled the page sideways by 1,232px). `--kometio-page-start-gap`
  is zero so that the band starts at the header's rule.
- **Every heading of a text is wide, in capitals, with a marker laid under it**;
  its colour goes round the three of the design. The title of a list of pages is
  larger and plain, as drawn.
- **A hero is set on the left unless somebody says otherwise.** Core's own
  default is the centre, which under a hero set on the left put a centred title
  over a tag and buttons on the left (the studio starter, which says nothing,
  showed it on every theme of this family). The three themes now say `start`
  where the site says nothing; `contentAlign` still wins.
- **The four states are flat colours with the ink round them**: the note is the
  yellow, as drawn; success the mint; a warning an orange; an error a red the
  accent is not.
- **The menu on a phone** is a mint box in the rule and its panel a white one
  with the same shadow; not in the design, drawn from its parts.
- **Left out on purpose:** the phrase of the headline set in the accent and the
  rotated sticker (a title is plain text, as for `paper`), the "Nota ·" label of
  the note (a word the theme would have to translate), the date under the title
  of a project page (a page has none), and the link beside the list's title
  (the starter puts its button below). The vertical rhythm of a long text is
  core's and differs from the design's by a few pixels.
- **The portfolio starts on `colour`.** The studio **stays on `classic`**: it is
  a centred, business-like site, and the three themes of this family are drawn
  for a hero on the left and a page that begins with its title. `night` and
  `colour` stay a choice in Style for it.

| Theme    | Character | Starter   | State                         |
| -------- | --------- | --------- | ----------------------------- |
| `paper`  | Carta     | Blog      | In (PR #120)                  |
| `night`  | Notte     | —         | In (PR #121), from Style only |
| `colour` | Colore    | Portfolio | In this pull request          |
