# 0139 — Three editorial themes, one at a time: paper, night and colour

**Status**: Accepted — 2026-10-15. `paper` is in; `night` and `colour` follow
in their own pull requests and amend the table at the end.

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

| Theme    | Character | Starter   | State                         |
| -------- | --------- | --------- | ----------------------------- |
| `paper`  | Carta     | Blog      | Merged with this pull request |
| `night`  | Notte     | —         | Next                          |
| `colour` | Colore    | Portfolio | After                         |
