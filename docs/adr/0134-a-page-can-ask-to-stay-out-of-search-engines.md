# 0134 — A page can ask to stay out of search engines

**Status**: Accepted — 2026-10-14. Extends
[0078](0078-a-term-can-ask-to-stay-out-of-search-engines.md) from a term to a
page.

## Context

The site has one switch for search engines (ADR-0016), all or nothing, and a
term has its own (ADR-0078). A page had nothing: a thank-you page after a form,
a page of terms and conditions, a landing page made for one campaign, an old
version kept for people who have the address — each is a page somebody wants
reachable and does not want found. The only answer was to hide the whole site.

## Decision

- **A switch in the page's SEO, per language.** "Hide from search engines" sits
  in the SEO dialog of a translation (`seoMeta.noIndex`, absent meaning off).
  It is per language because the SEO already is: a page can be worth finding in
  one language and not in another, and a term, which is one thing with one
  address per language, is the case where that distinction was refused
  (ADR-0078). No column and no migration.
- **The page says it, the sitemap leaves it out, and the answer carries it.**
  Exactly what a term gets: `<meta name="robots" content="noindex, nofollow">`
  on the page, the translation dropped from `sitemap.xml` (listing an address in
  the file that invites crawlers and then turning them away on arrival wastes
  the crawl and contradicts the page), and an `X-Robots-Tag: noindex, nofollow`
  header for a crawler that reads that first. One mechanism for both: the
  layout's `noindex` prop, which a term already passed and a page now does.
  The site-wide switch still wins where it is off.
- **It is a publisher's, and immediate.** SEO is read live, not from the
  published snapshot, so the switch takes effect without publishing again,
  like the title and the description beside it.
- **Nothing else on the site is hidden.** The page is still in the site's own
  search, in the feeds and in the lists that draw pages (a grid, a "next
  article"): hiding from search engines is not hiding from the site, which is
  also what the term's switch does.

## What this does not do

- **It does not remove the address from other pages' `hreflang` links.** A
  page's siblings in other languages still name a hidden translation as an
  alternate; search engines ignore an alternate that is `noindex`, and what a
  link says is not a thing to rebuild for that.
- **`nofollow` comes with it**, as it does for a term: the links on the page
  are not followed either. A person who wants only one half of the pair has no
  way to say it; nobody has asked.
- **One flag per language, not per group.** Hiding every language of a page
  together is two clicks.
- **It is not access control.** A page that must not be seen needs to be a
  draft.

## Consequences

- `seoMetaSchema` has one optional field, so every stored page and every request
  that does not know it is unchanged, and a duplicated page keeps its flag.
- `PublishedPagePath.noIndex` is what the sitemap filters on; the paths other
  readers use are unchanged.
- The SEO dialog is shared with a term's route and offers the switch only for a
  page (`showNoIndex`): a term keeps its flag on the term.
