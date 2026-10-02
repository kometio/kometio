# 0066 — A term has a page, and it is a page

**Status**: Accepted — 2026-09-09

## Context

ADR-0064 gave a term an address and ADR-0065 gave it the rules that keep
that address free. Nothing rendered it. This decision is what a visitor
sees at `/{locale}/{prefix}/{slug}`.

The plan's requirement is that a term be **reachable**, not that it be a
page an agency has to build: fifty terms would otherwise mean fifty pages
by hand, and a term with no URL does not exist for a search engine.

## Decision

### A term's page is shaped exactly like a page

`PublishedTerm` is `PublishedPage` plus one field. It carries the site's
header and footer, its own SEO block, its translations and a list of
blocks — so `PublicPageContent.astro` draws it with **no new rendering
path**, and every block, style rule, instance class and theme override
works on it without knowing it is a term.

The alternative was a bespoke term template. It would have started
smaller and then needed, one at a time, everything a page already has.

### The default layout is made of ordinary blocks

Two of them: a `Hero` carrying the name and the introduction, and a
`PageGrid` listing what is filed under the term.

`Hero` and not `Heading` because it is the only block that renders an
`<h1>` — `Heading` offers h2/h3 by design, for sections inside a page.

`PageGrid` is a real block in the registry, insertable by hand on any
page ("the three articles in this category, here"), not a fragment that
only the term route can draw. That is what the plan asked for, and it is
also what the filters will need later.

Its `items` are **not a field**: they are filled in by a render pass,
exactly as a picked page's address already is (`resolvePageReferences`).
The block stores WHICH pages it wants — a term — and the server turns
that into titles and addresses in the language being rendered. Offering
the list as an input would let somebody type something that has nothing
to do with the term.

### A page always wins, and the route proves it

The catch-all route asks for a page first and looks for a term only
where no page answered. The write-path checks of ADR-0065 make a
collision impossible to create; this ordering makes the answer defined
even if one ever existed.

The untranslated-page fallback redirect now runs **after** the term
lookup. It answers "this address has no page in this language", and a
term living there is exactly the case where that conclusion is wrong —
redirecting first would send a visitor away from a page that does exist.

### One walk of the hierarchy, shared

`listPublishedPagePaths` is now the single answer to "where does this
site's published pages live", used by the sitemap and by the lists a
term draws. They were about to be two walks of the same tree, which is
how two answers to one question start disagreeing.

A page with no published translation in the language being rendered, or
with a gap in its ancestor chain there, is left out of the list rather
than listed as a dead link.

### Nothing takes the page down

A term with no pages, a term that was deleted, a `PageGrid` with no term
chosen: all three render an empty list. A landing page that is missing,
untranslated or unpublished falls back to the default layout. The
address keeps answering in every one of those cases — which is the whole
reason ADR-0064 renders the landing page in place instead of redirecting
to it.

## Consequences

- **The landing page was still reachable at its own slug** when this
  shipped, so its content answered at two URLs. **Closed by ADR-0067**,
  which moves it with a 301 and takes the old address out of the sitemap
  in the languages where the term answers.
- The editor cannot yet create a taxonomy, a term, or file a page under
  one; the API can. The classification panel is what Fase 8 still owes,
  and the `PageGrid` block's term picker (shipped here) is the first
  piece of it.
- Verified against the served HTML, not the reasoning: a term created
  through the authenticated API answered at `/en/qa-category/espresso-qa`
  with its name as `<h1>` and `<title>`, its description as the meta
  description, and both filed pages listed with the addresses they
  actually have. Setting a landing page changed what was drawn on that
  same URL and nothing else. The test data was removed afterwards and the
  tables checked back to zero.
