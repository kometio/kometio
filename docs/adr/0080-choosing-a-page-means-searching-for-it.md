# 0080 — Choosing a page means searching for it

**Status**: Accepted — 2026-09-24

## Context

ADR-0074 gave a page a parent, and picked a flat indented select to
choose one with, on a stated assumption: a Kometio site is "5-15 pages",
so the choice is one click deep and the whole tree fits in a dropdown.

It does not. The docs site this project publishes has 56 pages. The
select asked for the first page of the list and drew a tree from it,
which is the one shape that cannot be paginated — a child whose parent is
on the next page has nowhere to hang. So it showed twenty pages, had no
pager, and offered no way to name the twenty-first as a parent at all.

The dialog that picks a page for a link, a policy or a term's landing had
the same ceiling with the opposite ergonomics: twenty at a time, a Next
button, and no search. The two shared nothing.

## Decision

### One list, two containers

`PageSearchList` holds the search field, the server-filtered list and the
pager. The parent picker puts it in a popover with "at the top level" as
its first row; the page picker puts it in a dialog. Rows are the same
either way: the title, indented, and the slug beside it.

### Indented by the results, not by the tree

A row's depth is how far under another row **in the same set of results**
it sits. A search returns the pages whose titles match, without their
ancestors, and indenting those by their real depth would draw a tree with
no trunk. A page whose parent did not come back is drawn at the top,
which is the truth about what is on screen.

### The subtree exclusion moved into the query

A page cannot move inside its own child, so the parent picker must not
offer its own descendants. That used to be a walk over the fetched list,
which stops working the moment the list is filtered: a descendant three
levels down arrives on its own.

`PageGroupListFilters.excludeSubtreeOf` is now answered by the database,
as a recursive walk down `parent_id`, and it narrows the count as well as
the rows — a filter that hides rows from the page but not from the total
draws a Next button onto an empty page.

## Consequences

- The search is the server's. Filtering the twenty rows already fetched
  is the bug this replaces, not a cheaper version of the fix.
- The trigger reads the current parent by its id rather than looking for
  it in the list: a filtered list is not guaranteed to hold it, and a
  field that reads "at the top level" for a page that has a parent is
  worse than one that is briefly blank. That is one extra cached read per
  page that has a parent.
- The page picker gains hierarchy it never showed, for free.
- The popover is capped to the height Radix measured for it. Without
  that, on a short window, it opened upwards and put its own search field
  off the top of the screen — found by measuring, not by reading.
- ADR-0074's "5-15 pages" assumption is retired wherever a list of pages
  is shown. It is still true of the sites Kometio is aimed at; it is not
  something to build a control on.
