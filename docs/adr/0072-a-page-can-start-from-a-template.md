# 0072 — A page can start from a template

**Status**: Accepted — 2026-09-14

## Context

An agency builds the same kind of page again and again: a service page
with a hero, a paragraph, a call to action and a FAQ; a news article with
its date line, body and related articles. Every one of them starts from an
empty canvas and gets rebuilt by hand.

The word "template" was already taken twice, and the gap is the third
meaning:

1. a **variant** — how one kind of block looks (ADR-0047);
2. a **reusable section** — a strip placed on many pages, either shared
   live or copied once as a `template` (ADR-0059);
3. a **page template** — "every service page has this shape". It did not
   exist.

The use case that made it concrete: a newsletter strip on every page, or
on half of them, without placing it by hand each time.

## Decision

### A page template is a section of kind `template`

No new table and no new kind. ADR-0059 already has an object that is a
published tree of blocks, copied with new ids and linked to nothing
afterwards: the `template` section, which the canvas inserts into a page.
A page template is the same object used at the other moment a page gets
blocks, when it is created.

Three options were weighed on 2026-09-14:

- **reuse `template` sections** — chosen;
- **a third kind, `page`, in the same table** — tidier lists (page
  templates only in the New page dialog, strip templates only in the
  canvas), paid for with an enum migration and a branch everywhere the
  kind is read. The New page dialog listing a strip template as a starting
  point is legitimate, not noise; if the lists grow crowded, a kind can
  still be split out later without moving any data;
- **a page flagged `is_template`** — it would carry every language and
  the SEO fields, and be edited in the real page editor. It was rejected
  because every query that lists, routes, indexes or links pages would
  have to exclude it: sitemap, RSS, search, PageGrid, SubPages,
  RelatedPages, the link picker, term and author pages, the pages list and
  the public route itself. One forgotten filter publishes a template, and
  a template would occupy an address.

### A copy, not a link

Creating a page from a template copies the template's **published**
blocks with fresh ids, and the page owns them from then on. Changing the
template changes the pages created afterwards, never the ones that exist.

What has to stay the same everywhere goes **into** the template as a
**shared section**. The `Section` block's reference survives the copy like
any other prop, so every page made from the template shows the live
section, and editing it once changes all of them. That is how the
newsletter case is answered — and the dialog's hint says the blocks are
copied, so nobody expects the other behaviour.

The copy is made on the server (`POST /page-groups` with `templateId`),
not in the browser as the canvas insert is. The server is where "a
published template of this site" can be checked, and the WordPress
importer will create pages through the same door. Anything else is
refused with **404**: a shared section (`NotAPageTemplateError` — its
promise is that it is never copied), a draft, another site's section, a
missing one. To the person starting a page they are one answer — there
is no such template to start from — and which ids exist elsewhere is not
something to confirm. Keeping them off 400 also leaves 400 meaning a
malformed request, which is what lets the editor tell "that template has
gone" apart from a name too long to become an address. `content` and
`templateId` together are refused by the schema, rather than the server
picking one of them silently.

### A page and its first language are created together

Creating a page from the editor used to be two requests: the group, then
its first language. The second could be refused — an address already
taken — after the first had landed, leaving a page with no language:
listed with no title, and crashing the editor that opened it. With a
template chosen the leftover also carried the copied blocks, so this
feature would have made it happen more often.

`POST /page-groups` now takes the first language (`translation`) and
`createPage` writes the group, its first version and that language in one
transaction (`PageGroupRepositoryPort.saveNewWithTranslation`), after
checking everything that can refuse — the template, the address, a
root-mounted term. The transaction is the repository's to hold, as for a
term and its addresses: a use case orchestrating one across two ports is
the coordination a repository exists to hide. The editor always sends the
language; a page started from a template must (the schema refuses one
without). Creating a group alone is still accepted for the callers that
predate this.

Pages already left without a language open onto an explanation and a way
back to the list, instead of the crash.

### One language: the default one

A template holds the text of the site's **default language**, like every
section. Translating the pages made from it is the job of whoever writes
them, exactly as for a page started blank — a new page is created in the
default language, and the others are added in the editor.

"Save as template" on a page therefore takes the default language whatever
language the editor is showing. A template saved from the English view of
an Italian site would otherwise start every new Italian page in English.
It takes what that language actually shows (`PageTranslation.currentContent`):
the shared structure with that language's overlay, or its own blocks when
the translation is unlinked. A page with no translation in the default
language falls back to the shared structure.

The template is **published at once**, as "turn into a reusable section"
is: the New page dialog offers only published templates, so a draft would
make the button look as if it had done nothing. It is written already
published, in the same save that creates it (`createReusableSection` with
`published: true`), rather than created and then published by a second
call — a publish that failed in between would leave a draft holding the
name, which a retry then finds taken.

### A collection suggests one

A collection gets `default_template_id`, preselected in the New page
dialog when a page is created from that collection's screen. It is a
suggestion — blank is one click away — and not a rule.

This is not the collection growing a field, which `Collection` forbids: it
decides which blocks a new page **starts** with, and nothing about the
page afterwards. The column is `on delete set null`: deleting a template
takes a suggestion away and must neither delete the collection nor block
the delete. It is validated when it is **set** (a published template of
the same site), not only when it is used, because a default the dialog
cannot offer would otherwise be preselected as nothing, silently.

### Saving as a template copies the page as it is on screen

The canvas sends any change still waiting out its 300 ms debounce the
moment an entry of the page menu is chosen. Sending is all that does for
the other entries. "Save as template" also waits for the save to land, and
refuses — saying why — when the last save failed: a failed save settles
the queue too, and the server would otherwise copy the page as it was
before that edit while the editor reported success.

## Consequences

- `PageTranslation.currentContent(groupContent)` is the one definition of
  what a language shows. Publishing and the preview each had their own
  copy of the rule; the template would have been the third.
- `createPageGroupFromTemplate` is a use case of its own that computes the
  starting blocks and hands them to `createPageGroup`, which is unchanged.
- A duplicate now stays in its collection. `duplicatePageGroup` never
  copied `collectionId`, so an article duplicated from the News screen
  landed under Pages, which to the person who clicked Duplicate looked
  like the copy had vanished.
- The editor's templates list is `publishedTemplatesQueryOptions`, one
  selection over the cached sections list, read by the canvas template
  picker, the New page dialog and the collections dialog. A value that is
  not among those templates — a default deleted a moment ago, still in a
  cached collection — reads as a blank page.
- The New page dialog keeps Create disabled until the templates (and,
  inside a collection, its default) have answered: pressed earlier, it
  would make a blank page nobody chose.
- A shared section's row in the sections list counts the templates that
  hold it, draft or published, beside the pages that show it, and the
  delete confirmation says so. Deleting the newsletter a template carries
  empties a strip on every page made from that template afterwards, which
  the page count alone could not say.
- Two requests that both pass the name check reach the unique constraint;
  the repository now turns that into `ReusableSectionNameAlreadyExistsError`
  (409), for "Save as template" and for creating a section alike, instead
  of a 500.
- The New page dialog wraps a long address preview, which used to widen
  the dialog past the screen and take Create out of reach, and refuses a
  name whose address would exceed `PAGE_SLUG_MAX_LENGTH` (200, now shared
  with the API's own schema) before sending it.
- Not done: a template carries no translations and no SEO fields;
  nothing records which template a page came from; applying a template to
  pages that already exist is not offered.
