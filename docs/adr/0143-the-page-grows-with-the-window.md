# 0143 — The page grows with the window, and the header stops where the layout stops

**Status**: Accepted — 2026-10-15.

## Context

"It does not adapt to the size of the browser", said of the public site, on
every theme. Measured on a real browser at 320, 390, 768, 1024, 1280, 1440,
1920 and 2560 pixels, on `classic` and `docs-showcase`, across the starter's
pages, the docs hierarchy and the eight pages of block samples, loading each
width fresh **and** resizing one window in place (they come out identical, so
nothing is stale after a resize):

- **Nothing overflowed**, from 320 to 2560, except one thing: the Cloudflare
  widget in a form on a 320px phone. It is 300px, the form has 272, and it
  pushed the whole page sideways by 4px.
- **The page did not grow.** The column is 64rem at every width above 1024: at
  1920 it is 53% of the window, at 2560 it is 40%, and the headline is 48px
  (68px on the docs theme) on both. A larger screen gave a smaller page.
- **The header and the footer did not follow the page.** They painted edge to
  edge with 24px of padding, so on a 2560 window the logo was at 24px, the menu
  at 2535px, and the content in a column from 768 to 1792.
- **The docs theme counted its gutter twice.** The shell has its padding and each
  block inside its column added the page's own gutter on top: on a phone the
  text started 48px in, the sidebar above it 24px; on a desktop it started 24px
  in from the rule under it and from the pager's box.

## Decision

- **The root font size rises with the window from 1440px**, by
  `--kometio-scale-rate` (0.0036) pixels per pixel, to at most
  `--kometio-scale-max` (125%), which is where it is at 2560px. Everything
  written in rem grows with it: the column (64rem is 1024px at 1440, 1135px at
  1920 and 1280px at 2560), the gutters, the type, the spacing. The three are
  tokens, so a theme whose design does not scale says
  `--kometio-scale-max: 100%`.
  - **A percentage, never pixels, and never below 100%**: the reader's own
    default size is the floor and stays theirs.
  - **Media queries are not touched**: rem inside a media query is the
    browser's initial size, not the root's, so Tailwind's `sm:` and the rest
    flip exactly where they did, and the container queries that are in pixels
    are asked of boxes that are 1024–1280 wide where they were 1024.
- **The header's and the footer's content stops at `--kometio-shell-width`**
  (90rem: the window itself at 1440), centred, on the page's own gutter, while
  they still paint edge to edge. At or below 1440 it is the 24px it was. A
  region of a theme's own opts in with a class (`kometio-shell-inset`).
- **The docs theme's column takes its gutter from the shell**
  (`--kometio-content-gutter: 0` on `.kometio-docs-shell__content`), so the text,
  the sidebar above it, the rule and the pager are on one line.
- **The captcha widget asks for its compact size where the normal one does not
  fit.** It decides when it is drawn, which is when the page loads.

## What this does not do

- **Nothing changes at or below 1440px** — verified by comparing every
  measurement taken before the change with the one after it, page by page.
- **No new breakpoints, no per-element `clamp()`.** One scale, at the root,
  from one place.
- **The widget is not redrawn when a window is dragged below 348px**, which a
  desktop browser does not do (its minimum is wider) and a device emulator does.

## Consequences

- `global.css` carries the three scale tokens and `--kometio-shell-width`, the
  `html` rule that reads them, and `.kometio-shell-inset`; `DefaultHeader` and
  `DefaultFooter` use it in place of `px-6`.
- A theme's own header or footer is not changed. It can use the class.
- The measurements are in the pull request; a spec keeps the floor, the cap and
  the media queries as described.
