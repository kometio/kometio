# 0079 — A form submission records the page it came from

**Status**: Accepted — 2026-09-24

## Context

`form_submissions.page_id` has existed since the form builder landed
(ADR-0015) and nothing has ever written to it. The column was even
repointed once, from the old `pages.id` to `page_translations.id`, with a
comment saying that nothing populated it either way.

The reason was structural rather than an oversight: the public site did
not know which page it was rendering. `PublishedPage` carried the
content, the SEO block, the translations and the site's chrome, and no
identity of its own — so the Form block, sitting somewhere deep inside
`content`, had nothing to name.

That left the form inbox unable to answer the one question it is opened
for beyond reading the answers: which page converts. It matters most
exactly where the form is not on one page — a newsletter box in the
footer is on every page of the site, and its submissions were a single
undifferentiated list.

## Decision

### The page's identity travels with the page

`PublishedPage` gains `id`: the page translation's id, nullable because
some things that render as a `PublishedPage` are not a page — a term
with no landing page (ADR-0064), an author archive (ADR-0071), a reusable
section previewed on its own.

`PublicPageContent.astro`, the one component every route that renders a
page goes through, writes it to `Astro.locals.pageTranslationId`; the
Form block reads it from there.

Ambient rather than a `BlockRenderer` prop, deliberately. Threading it
would mean a new field on the render context and a new entry in the
dispatch table for the benefit of one block out of 116 — and that block
already reads request-scoped context directly, both the query string it
shows its success banner from and the Turnstile site key. The cost is
that the dependency is invisible from the block's signature, which is
what the comment on `App.Locals` is for.

### It reaches the API as a hidden input, and is not believed

The form posts `_pageId` alongside the hint fields it already posts, so
the value is client-supplied on an endpoint anyone on the internet may
call. `submitForm` reads the page translation and stores the id only if
it belongs to the form's own site.

A foreign key does not make that check: Postgres validates a reference
without applying row-level security, so it accepts any row that exists,
whoever owns it. Without the check a submission could be labelled with
another site's page, and an invented id would be a constraint violation —
a 500 that loses the answers somebody typed.

So an unrecognised page is recorded as **no page**, never refused. The
answers are the submission; the origin is a note in the margin, and
losing the first over the second would be the wrong trade.

### Named once per page, not per row

The list and the export return the distinct pages their submissions came
from, each with its title, language and group id. A form on one page
sends one entry however many submissions it has, and the reads are one
per page rather than one per row — which is what makes the footer
newsletter case cheap rather than expensive.

## Consequences

- The submissions list names the page under each expanded row and links
  to it; the CSV gains a `Page` column second from the left, where a
  spreadsheet groups by it.
- Submissions recorded before this show no origin, and always will.
- `page_id` stays `on delete set null`: delete the page and the
  submission survives without it. The provenance is lost, and that is
  accepted — a link that follows a page when it is renamed or moved was
  worth more than an address frozen at the moment of submission.
- Nothing else reads `PublishedPage.id` yet. It is a page's real id on a
  public payload, which is not a secret — no public route accepts one,
  and previewing a draft needs a token (ADR-0035).
