# 0144 — A button that copies is markup, and the page wires it

**Status**: Accepted — 2026-10-15.

## Context

A sample of code is something a reader takes away, and the Code block had no
way to take it: select, hope the selection started and ended where it should,
copy. The product already had the behaviour — PromoCode and ShareButtons copy a
code and a page's address, with a confirmation said on the button and to a
screen reader — and each block carried its own `<script>` to wire it.

That is where it stopped. The docs theme overrides the Code block (a window
chrome round the sample), and a theme's override is a copy of core's block
(ADR-0021): it cannot import from the public site, because a theme imports only
the packages a theme is allowed to, and one that lives outside this repository
has to stand alone. A script in the override would have had to copy the
clipboard logic into the theme, with its fallback for a page that is not served
over HTTPS, and every theme that overrode a block with a copy button would have
had to do the same.

## Decision

- **The button is markup, and the markup is the contract.** An element carrying
  `data-kometio-copy-text` (the text itself) or `data-kometio-copy-from` (a
  selector, looked up from the button outwards, whose text is copied) is a copy
  button, with its confirmation in `data-kometio-copied-label` and
  `data-kometio-copy-failed-label` and the words inside
  `data-kometio-copy-label`.
- **The page wires every one of them, once.** `PublicPageContent` runs
  `initCopyButtons()` next to the entrance animations; PromoCode and
  ShareButtons lost their own scripts for it, and the registry still lists
  them (and Code) for a block inserted live in the canvas. A theme's override
  emits the markup and carries no script.
- **The Code block copies what is already on the page**, `data-kometio-copy-from="pre"`,
  not a second copy of it in an attribute: a sample would otherwise be sent
  twice. The text of the highlighted `<pre>` is the sample, line breaks and all.
- **It is always drawn and never on hover only**: a touch screen has no hover and
  a keyboard would have to find it first. Not drawn for an empty sample.
- **Its words come from core's dictionary** (`code.copy`, `copyButton.copied`,
  `copyButton.failed`), which is the block's `i18n`, so a theme's override says
  them in the site's language without a dictionary of its own.

## What this does not do

- **It does not wire any other behaviour from the page.** Tabs, the carousel and
  the rest are still wired by their block's own script, which a theme's override
  of them has to carry or do without. A page-level contract for those is a
  decision of its own, with a cost per page this one (about 0.7 KB) does not
  have.
- **No `execCommand` for its own sake.** It is the old route, kept for a page
  served without HTTPS, where `navigator.clipboard` does not exist.

## Consequences

- `copy-button.ts` exports `initCopyButtons`; its selector takes both
  attributes.
- The docs theme's Code override has the button in its title bar, after the
  language, and its core-copy fingerprint is re-reviewed.
- A spec reads both Code blocks and fails if either loses the contract or grows
  a script of its own.
