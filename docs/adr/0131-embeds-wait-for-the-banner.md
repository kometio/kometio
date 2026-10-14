# 0131 — Embeds wait for the banner, and load when it has been answered

**Status**: Accepted — 2026-10-14. Builds on
[0039](0039-cookie-consent-categories-and-prior-script-blocking.md) (the
categories and the inert `<template>` the site's trackers already go through).

## Context

The site's trackers wait for the cookie banner: an inert `<template>` per
category, opened by the consent bootstrap once the visitor has agreed
(ADR-0039). Two things that are third parties' code did not.

- **Video, Map and Booking** sat behind a button that the visitor had to press
  to load them, which is a complete answer to "nothing is requested before they
  ask" and a second question to a visitor who had already answered the banner
  with yes.
- **EmbedHtml**, the block that takes pasted HTML, rendered its sandboxed frame
  at once: a chat widget or an analytics snippet in it ran on the first
  request, whatever the banner said. The review of 2026-10-11 (SEC-7b) named it:
  the one place a category was claimed and not kept.

## Decision

- **A visitor who has agreed to the category is not asked again.** The
  click-to-load embeds load at once when the banner has been answered with yes for
  `experience` (a video, a map and a booking calendar are third parties' pages),
  and load the moment it is, if the visitor answers while they are on the page.
  Where there is no consent API (a site with no banner, the editor's canvas) or the
  answer is no, nothing changes: the button is there.
- **EmbedHtml names a category** (`consentCategory`; `experience`,
  `functionality`, `measurement`, or `necessary` for "it needs no consent"), and its
  frame sits in the same inert `<template>` the trackers do: nothing in it is
  fetched or run until that category is granted. Until then there is a note where
  it will be, with a way to open the preferences, and the note goes when the
  embed is there.
- **Only where there is a banner to answer, and not in the canvas.** A site that
  has switched its banner off has no consent to wait for and would never show the
  block; the editor's canvas has no visitor and no record. In both the block is
  drawn as it was.
- **Not saying is `experience`.** A block saved before the choice existed has
  none, and a page that was stored must keep reading, so the field is optional in
  what is stored and `experience` where it is not said. The inspector shows that
  default for such a block, so that what is in force is what is shown.
- **The bootstrap says when it has opened something** (`kometio-consent-activated`),
  because an activation after the page's scripts have run leaves behaviour that was
  looked for before it was there (an embed that sizes itself to its content): the
  block looks again.

## Consequences

- **This changes what existing pages do, on sites that have a banner.** An
  EmbedHtml block without a category now waits for `experience` consent. That is
  the point, and it is not nothing: a snippet that was running for everybody now
  runs for those who agreed. A site with no banner is not affected.
- A theme's own override of EmbedHtml, Video or Map is not touched by this: the
  gate is in core's components.
- `Booking` shares the component with Video and Map and so loads the same way.
