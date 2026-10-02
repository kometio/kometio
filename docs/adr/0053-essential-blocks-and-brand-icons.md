# 0053 — The elementary blocks, and where brand logos come from

**Status**: Accepted — 2026-09-08

## Context

Fifty-two blocks, and none of them a **divider** or a **spacer** — the two
most-used blocks in every page builder there is. No standalone **icon**
either, despite a 2000-icon set already being wired end to end. No way to
put a row of **social links** in a footer.

Five blocks close that: `Divider`, `Spacer`, `Icon`, `SocialLinks` and
`SocialLink`.

## Decision

### Divider and Spacer have no props at all

Everything a divider can be — thickness, colour, style, how wide it runs,
the space around it — is already in the style vocabulary
([ADR-0047](0047-canvas-styling-architecture.md)), per breakpoint. A
`style` prop beside a `borderStyle` override would be the two-mechanisms
mistake [ADR-0050](0050-columns-container-and-the-colour-vocabulary.md)
found in `Container`, made deliberately this time.

For `Spacer` the argument is stronger than tidiness. Its height is
`minHeight`, an ordinary style property, so it **differs per breakpoint**
— 4rem of air on a desktop and 1rem on a phone is the thing people
actually want from a spacer, and a plain `height` prop could not say it.

`Divider` renders a real `<hr>`, the element that means a thematic break,
so the separation is announced rather than being a decorative box.
`Spacer` renders `aria-hidden`, because a screen reader has nothing to
gain from being told that space exists.

### An icon's label decides whether it is content

`Icon.label` empty means `aria-hidden`, which is right for a flourish
beside text that already says the same thing and wrong for an icon that IS
the message. The same choice `Image.isDecorative` makes, phrased as the
label it needs rather than as a checkbox.

### Social links are a collection

Rather than a bespoke list widget, `SocialLinks` is a collection of
`SocialLink` blocks — so it arranges itself like every other one
([ADR-0052](0052-collection-arrangement-as-a-value.md)), and each link is
an ordinary block to reorder, style and translate.

A `SocialLink` is an icon plus a URL, not a closed list of platforms: a
closed list is a promise to keep up with every network that matters, in a
release cycle, forever — and it is wrong the day somebody wants Mastodon
or a Discord invite. `label` is required, because an icon-only link with
no accessible name is announced as "link" and nothing else.

### Brand logos come from a second package

**Lucide removed brand logos from its set.** 2034 icons and not one of
Facebook, Instagram, YouTube or WhatsApp. Without logos a "social links"
block can only render the network's name as text, which is not what
anyone means by one.

`simple-icons` supplies them, under a `brand:` prefix. The prefix is not
decoration: **the two sets collide on 34 names** — `apple`, `box`,
`circle`, `bitcoin` — and an icon's name is stored in page content, so
`apple` has to keep meaning the same picture forever.

Three practical notes, each of which cost a measurement to find:

- simple-icons ships **solid shapes that name no fill**, where Lucide's
  are outlines drawn with `stroke`. Left alone they render black whatever
  `textColor` says, so `fill="currentColor"` is injected at load — the
  same override then works on both sets.
- The package's `exports` map **does not list `./package.json`**, so
  resolving through it throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime
  while typechecking perfectly happily. The entry point is resolved
  instead.
- **LinkedIn is absent**, removed at the trademark owner's request. Worth
  knowing, since it is the one most B2B sites ask for first.

**Licensing.** simple-icons is CC0, but the marks belong to their owners
and some carry their own licence — the package ships a `DISCLAIMER.md`
saying exactly that. Putting a company's logo on a link to that company's
page is the ordinary, intended use; anything beyond that is the site
owner's call.

### The two sets are fetched separately

Measured, not estimated: the interface set serialises to **1.1MB** and the
brands to another **5.2MB**, uncompressed, and the public site's server
does not compress. Loading both would have made every editor session pay
6.3MB for logos it may never open — a 5.5× regression introduced by a
feature most sites use once, in a footer.

`?set=brand` is a separate request, made only when the picker's Brands tab
is opened. The interface set is byte-for-byte the size it was before this
change. **Rendering** still resolves from both, because a page can hold an
interface icon and a brand mark side by side — only the picker pays per
set.

## Consequences

The icon picker grows tabs, which it needed anyway: somebody looking for
"star" should not wade through three thousand logos to find it.

Video and audio blocks are deliberately **not** here. Accepting uploaded
video first requires closing a gap this work surfaced — the media endpoint
applies no server-side MIME allow-list, and admin media is served inline,
unlike public form attachments which are forced to download precisely
because of it — plus per-type size limits, since `MAX_UPLOAD_BYTES` is
10MB and commented as "a generous photo, not a video". That is a PR of its
own, and mixing it with five CSS-shaped blocks would make both harder to
review.
