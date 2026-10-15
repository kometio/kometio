# 0136 — A new site can start from an example

**Status**: Accepted — 2026-10-15.

## Context

Walking the first run as a new person (PRD-8, 2026-10-14) ends at a site that
is one Hero with the site's name on it. It works, and it says nothing: the
page the owner has just made public has no header, no menu, no second page, no
form, and nothing to show how a Kometio site is put together. Every theme and
block the product ships is behind a blank page, and the person has to know
what to ask for.

The owner decided (D5) that the image ships three starting points, in Italian
and English, offered once, at the first start: a studio or services business,
a portfolio, a blog. The first is also the seed of the public demo (ADR-0118).
The condition set for presets in 2026-09 stands: **a seed, not a mode**.
Whatever a starter makes is ordinary pages, forms and sections, and nothing in
the schema or the code knows which one it was.

## Decision

- **A starter is data.** Three constants in `@kometio/application`
  (`starters/`): each says, in each language, the pages with their blocks, the
  header and footer, the forms, the sections of the editor and the categories
  it makes. It has no logic. Blocks are written with one function per block
  (`starter-blocks.ts`), which gives the props the block's schema asks for and
  nothing else.
- **It is made by the use cases a person's own clicks go through.**
  `applyStarter` calls `createPage`, `createForm`, `createCollection`,
  `createTaxonomy`, `savePageGroupContent`, `publishPageTranslation` and the
  header and footer's own, so a page is held to every rule a page is (an
  address that is free, a language that is enabled), the search index is
  written, and the content is what the editor would have saved. A starter has
  no door of its own into the database.
- **Pages refer to each other by key.** A starter cannot know the id of a page
  that is not made yet, and a link, a menu entry and a list of sub-pages are
  all ids. A block names its target (`starter:page:contact`), and the ids are
  chosen before anything is written: `createPage` takes an `id` for the
  caller that has to know it first (a request never carries one; its body has
  no such field, and a spec says so). Every block's props are then parsed with
  the block's own schema, so each default is in the stored block as the editor
  writes them.
- **Offered after the wizard, not in it.** The wizard keeps to what a person
  cannot go on without; what the site starts from is the next screen
  (`/starter`), which can be left with "A blank page". Where the site is still
  new, the pages list says so in one line and leads back to it. The choice is
  not preselected: any of the four would be a decision made for the person.
- **For a site that is still new, and only then.** `findWizardHome`: exactly
  one page, which is the wizard's Hero as it left it (the site's name, nothing
  else), no other form, section or category, and a header and footer that are
  empty if they exist. Anything else is `SiteIsNotBlankError` (409), and
  `GET /sites/:id/starters` says `available: false`, which is what the screen
  and the notice read. A starter laid over somebody's work is pages they did
  not ask for among the ones they did.
- **In the language the site was made in** (the wizard's choice, which is the
  base of the site, as on WordPress). Italian for an Italian site, English for
  an English one, and English for any other language, said on the screen
  before anything is made: it is a seed in the language the owner will
  rewrite anyway, and a site in French that came with Italian pages would be
  worse. Each language is written for that language, not translated: the two
  are held to the same pages, forms, sections and blocks by a spec, and to
  nothing else.
- **All or nothing, as far as the person can tell.** There is no unit of work
  to wrap that many writes in, so `applyStarter` keeps what it made, in order,
  and on a failure undoes it in reverse and puts the home page, the header and
  footer and the theme back. A site left half made would be one the screen
  refuses to offer again (it is no longer new) and the owner has to clean by
  hand.
- **The administrator's** (`configureSite`): it publishes pages, a form, a
  header and a footer. In a demo it is refused with the rest of what an
  administrator may do (ADR-0118); the demo's seed is a starter applied on a
  private installation and exported.
- **The wizard's home page becomes the starter's.** The same page, at the
  same address and with the site's name as its title, so nothing is left to
  redirect and the first thing the owner saw is still there.
- **No pictures.** A starter that shipped photographs would ship their
  licence, their files in the volume and a look that is somebody's. The
  starters are text and the theme's own shapes and colours; each says, in a
  callout, which of its content is an example to replace.
- **Its theme is part of it** (`themeName`), applied when the site is on
  another. All three are on `classic` today; the portfolio is meant to move to a
  theme of its own, and then it is this field that changes.

## Alternatives that were not taken

- **The same data written inside the wizard's transaction** (the first-run
  port). All or nothing for free, one screen. But that port is the one write
  that has no tenant, so it cannot use the repositories and would have grown
  raw inserts for six tables with none of their checks; the wizard would have
  stopped being short; and it could only ever be done at the first start.
- **A starter as a site archive in the image** (ADR-0105), opened on the
  first-run screen. It looks cheapest, since the demo is already an archive.
  It does not fit: an archive carries the accounts (`users` is not among the
  transient tables), so the wizard could not make the owner's own; it exists
  only in the single image, not in the compose files or in development; every
  migration would mean making six binary files again; and a binary file cannot
  be reviewed in a pull request.

## What this does not do

- **No starter on a site that has something.** Adding a blog to a site that
  has pages is a different feature: where it goes, which address wins, what
  happens to the menu.
- **No legal pages.** They are drafts made by the legal wizard
  (ADR-0040), with the owner's own details; the demo's are made with
  placeholders when its seed is made.
- **No images, no custom blocks, no style settings.**
- **Not transactional on the server.** The undo is best effort; a database
  that goes away between the failure and the undo leaves pages behind, and
  the person is told the example was not made.

## Consequences

- `SiteIsNotBlankError` in `@kometio/domain-core`, answered 409.
- `CreatePageGroupInput` takes an optional `id`.
- `STARTER_IDS` and `STARTER_LANGUAGES` in `@kometio/shared-types`, which the
  request schema and the screen read, and `starterOfferSchema` and the apply
  schemas in `@kometio/api-contracts`.
- `GET` and `POST /sites/:siteId/starters`, and `apps/api`'s
  `StartersModule`.
- Editor: the `/starter` route, `StarterPicker`, `StarterNotice` on the pages
  list; the wizard leads to it.
- Three specs hold every starter to the registry: each block's props against
  its schema (`auditBlockProps`), each block's place against the editor's own
  palette rules (`apps/api`, the one place the starters and the registry are
  both in reach), and the two languages to the same shape.
- The first-run browser test chooses the blog, so the image's own first start
  is the path that makes a section, a category and the listing blocks that
  read them.
