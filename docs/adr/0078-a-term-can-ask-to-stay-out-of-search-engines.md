# 0078 — A term can ask to stay out of search engines

**Status**: Accepted — 2026-09-24

## Context

Every term has an address of its own (ADR-0064), and that is the point:
a term with no URL does not exist for a search engine. But the same
mechanism produces addresses nobody would want found. A dimension with
forty terms, three of which carry one page each, publishes forty pages,
and thirty-seven of them say almost nothing.

The pre-import plan left the question open in writing: "per-term
`noindex` for thin category pages — undecided". Nothing in the product
could express it, and the only switch that existed was the site-wide one,
which is all or nothing.

## Decision

### A switch, not a rule on a count

A term carries `noindex`, off when it is created, flipped by whoever
publishes from the Classification screen.

The alternative — hiding any term under N pages automatically — was
rejected for two reasons. A category grows: the page that is thin today
is the one collecting the next twenty articles, and a rule would have
hidden it through exactly the period when it needed to be found. And the
reason would be invisible: nobody looking at the screen would see why
that address is missing from Google, because nothing on it would say so.

Whoever publishes knows which of their categories is a real destination
and which is bookkeeping. The product asks them instead of guessing.

### It is one flag, not one per language

A term is one thing with one address per language. Judging it thin in
Italian and worth finding in English is a distinction nobody has asked
for, and `seoMeta` is already per-locale for the cases that do need it.

### The page says it, and the sitemap leaves it out

Both, or neither is worth doing. `<meta name="robots" content="noindex,
nofollow">` on the term's own page, and the term dropped from
`sitemap.xml` — listing an address in the file that invites crawlers in
and then turning them away on arrival wastes the crawl and contradicts
the page.

The site-wide switch still wins where it is off: that one is about the
whole site not being ready to be found, and a term cannot overrule it.

## Consequences

- A thin category can stay reachable for a visitor following a filter
  while staying out of search results, which is the case that made this
  worth building.
- `terms.noindex` is a column, so it survives a rename, a move in the
  tree and a change of address.
- Nothing recomputes it: a term hidden in a quiet month stays hidden when
  it fills up, until somebody flips it back. That is the cost of refusing
  the automatic rule, and it is deliberate.
- The public site's `PageLayout` now takes a `noindex` prop. Pages never
  pass it — theirs is the site setting — so the published HTML of every
  page is unchanged.
