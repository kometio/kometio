# 0067 — A claimed page moves to the term, permanently

**Status**: Accepted — 2026-09-09

## Context

ADR-0066 renders a term's hand-built landing page **on the term's own
address**. It left the page answering at its own slug too, so the same
content lived at two URLs — the duplicate the plan set out to avoid, and
the one thing a search engine punishes without ever saying so.

Two ways to close it: refuse the old address (404), or move it (301).

## Decision

### 301, not 404

The content did not disappear; it lives somewhere else now. A permanent
redirect is what hands the inbound links — the most expensive thing a
site has and the slowest to rebuild — and the ranking that comes with
them to the new URL. A 404 throws both away to save a redirect.

It is also the same argument ADR-0064 used in the other direction: it
refused to redirect the term's URL to the landing page, because deleting
that page would then kill every external link to the term. Here the
asymmetry points the other way — the term's address is the one that
survives an edit, so it is the one to consolidate on.

### The lookup answers three things, not two

`getPublishedPageBySlug` returns `{ page, redirectTo }`. An address
serves a page, or has moved, or is nothing — and `page: null` with a
`redirectTo` is not "missing", it is "moved". Collapsing the two would
make the caller guess.

The check runs **before** the page is assembled: building content whose
only use is to be discarded is work done for nothing.

### The API reports it, apps/public-site performs it

A 404 body carrying `movedTo`, exactly like the `fallback` the
untranslated-page case already returns. The API is a data API: which
status code a _visitor_ gets is a decision about browsers and crawlers,
and it belongs to the thing that talks to them. Both public routes — the
catch-all and the locale root — answer it with a 301, while the
untranslated fallback stays a 302, because that one is a courtesy and
not a move.

### A term that does not answer in this language moves nothing

A term with no slug in the locale being rendered has no address to send
anybody to. The page keeps serving its own URL there rather than
redirecting into nothing.

The sitemap follows the same rule, and per **(page, locale)** rather
than per page: the claimed page is dropped only in the languages where
the term actually answers. Dropping the whole group would hide a URL
that is still live.

### Terms are in the sitemap, grouped for hreflang

A term's address is listed like a page's, with its own languages as
`hreflang` alternates — grouped by the term id, exactly as a page's
entries are grouped by their page group. A term with no URL does not
exist for a crawler, which is the whole argument for giving terms
automatic routes in the first place (ADR-0064).

The canonical needed no change: `PageLayout` builds it from the
translations the page carries, and a term page carries its own.

## Consequences

- Making a published page a term's landing page changes what its old URL
  does, for everyone, immediately. That is the intent, and it is
  reversible: unset the landing page and the old address serves the page
  again, as it did before.
- Verified live, against the served HTTP: claiming `/en/docs` turned it
  into a **301** to `/en/seo-qa/moved-qa`, which answered 200; the
  sitemap dropped both of the page's locale entries and gained the
  term's two, with the hreflang pair between them; and the entry count
  reconciled exactly against the database (98 published translations − 2
  claimed + 2 terms). Unsetting it put `/en/docs` back at 200.
