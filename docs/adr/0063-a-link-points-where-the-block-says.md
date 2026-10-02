# 0063 — A link points where the block says, or nowhere

**Status**: Accepted — 2026-09-09

## Context

Seven block components — Button, Link, NavLink, Banner, PromoBar,
PricingPlan and Image — each carried their own copy of the same
expression:

```ts
const href =
  linkType === 'page' && page?.locale && page?.slug
    ? localePathFromAncestors(page.locale, page.ancestorSlugs ?? [], page.slug)
    : url;
```

The else-branch hands back the URL field **whatever the reason** the page
did not resolve. Three different situations collapse into it:

1. the author chose "Site page" and never picked one;
2. the page was picked and has no translation in the locale being
   rendered — `resolvePageReferences` sets the reference to `null` for
   exactly this, and its own comment already calls that "the same
   'nothing to link to' state a field that was never picked at all
   already renders as";
3. the page was picked and resolved — the only case the branch was
   written for.

In (1) and (2) the block linked to the URL field. That was survivable
while the editor showed both fields side by side; ADR-0062 made them
conditional, so the block now links to a value the panel does not show.
And when that field is empty the result is `href=""`, which is not an
inert link: the empty string resolves against the current document, so
clicking reloads the page.

Rich text already behaved correctly — `resolveRichTextPageLinks` drops
the `href` attribute entirely when a `kometio://page/<id>` cannot be
resolved. The block components were the outlier, seven times.

## Decision

### One function, in the package themes already build against

`resolveLinkHref({ linkType, page, url })` in `@kometio/theme-runtime`
returns the destination or `null`. `linkType` decides, alone: `page`
resolves only through a picked page that has an address, `url` only
through a non-empty (trimmed) string, `none` never.

It lives in `theme-runtime` and not in `apps/public-site` because a
theme's own override of one of these blocks needs the same answer — and
the theme in this repo is the proof: `themes/docs-showcase/blocks/
Button.astro` had its own copy that resolved a page with `localePath`
rather than `localePathFromAncestors`. A Button pointing at a nested
page linked to `/en/styling-for-each-size` instead of
`/en/docs/using-the-editor/styling-for-each-size` — a 404, verified
live. That is the bug ADR-0029 created and PR #137 fixed everywhere
except inside this file, because the file was a copy.

Structural typing, not an import of `PickedPage`: `shared-types` already
depends on `theme-runtime`, so an import the other way would be a cycle.

### No destination means no `href`, not an empty one

Button, Link and NavLink keep their `<a>` and omit the attribute
(`href={href ?? undefined}`). The element, its classes and its styling
are unchanged, so nothing about the page's appearance moves; it simply
stops being a link. Banner, PromoBar and PricingPlan already hid their
button behind a `hasLink` flag — that flag is now the same answer as the
href, where before the two could disagree.

### The panel says so before the page does

`required` moves from the three textual field kinds onto every field, so
the page picker — a `custom` field — can declare it. Whichever
destination field is on screen is required, and only one ever is
(ADR-0062's `showWhen`).

This is the other half of the decision, not a nicety. Removing the
fallback makes a block with no destination render as a non-link, and
without the nudge the only symptom would be a button that quietly does
nothing when clicked. It stays a soft warning, never a save or publish
blocker, like every other required marker in this editor.

## Consequences

- A block whose author chose "Site page" and picked none stops linking
  to whatever is in its URL field. No content in this workspace was in
  that state — checked across `page_groups`, `page_translations`,
  `site_layout_sections` and `reusable_sections`, drafts and published
  snapshots alike — so nothing here changes. An installation that does
  have such a block will see the button lose its link, and the editor
  will show it as an unfilled required field, which is what it is.
- A menu entry pointing at a page with no translation in the current
  locale stays visible and stops being a link, instead of quietly
  reloading the page.
- Verified against the served HTML, not by reasoning: the same published
  Button rendered `href="/en/docs"` under the old code and no `href` at
  all under the new one, with the page in that state; and pointing it at
  a nested page rendered `/en/styling-for-each-size` (404) before and
  `/en/docs/using-the-editor/styling-for-each-size` (200) after. The
  published content was restored and re-compared afterwards.
