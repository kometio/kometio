# 0074 — A page can change its place in the tree, and its old address keeps answering

**Status**: Accepted — 2026-09-18

## Context

A page's address is built from its ancestors: `/it/servizi/idraulica` is
the page `idraulica` hanging under `servizi` (ADR-0029). Where a page
hangs was decided once, at creation, and never again — and creation only
ever offered the root. Three separate comments in the editor said so,
each pointing at the next as the place where the missing parent picker
was tracked; there was no endpoint behind them either.

So a site whose structure turned out wrong had one remedy: delete the
page and write it again somewhere else, losing its history, its address,
and every link anyone had saved to it.

Renaming used to have the same problem and does not any more: a
translation remembers the slugs it left behind (`formerSlugs`), and public
resolution answers an old address with a 301 to the current one
(ADR-0056). A move is the same promise about a different part of the
address — except that nothing in the branch the page left points at where
it went: the page is simply no longer among that parent's children.

## Decision

### Where a page hangs is asked at creation and changeable afterwards

`POST /page-groups` already accepted `parentId`; the editor now sends it,
asked as a flat, indented select of the site's pages. `PATCH
/page-groups/:id/parent` moves a page that already exists. Both are about
the site's tree — a different question from `PATCH :id/collection`, which
only decides which screen lists the page.

### The old address is remembered on the language, next to the old slugs

Each `PageTranslation` gains `formerParents`: the pairs `(parentGroupId,
slug)` it answered at before. Public resolution walks a path segment by
segment, asking each parent for a child with that slug; when neither the
current slug nor a former one answers, it now asks "who used to live
here?" and, finding the page, redirects to where it lives now.

The pair is the unit, not the parent alone: the same slug under a
different parent is a different page. The address it redirects TO is
rebuilt by walking the parents the page hangs from now — the path
collected so far is a prefix of an address that no longer exists.

The alternative considered was a `page_redirects` table (site, locale,
from_path → page), which would also carry manually written redirects and
the ones a WordPress import brings along. It stays on the table for that
day: it is a second mechanism for something `formerSlugs` already does
one way, and a move is the same kind of event as a rename, not a new one.

### The group and its languages move in one transaction

A language row carries its parent too — denormalized for the slug
uniqueness constraint and so public resolution needs no join. A group
saved without its languages would leave the page hanging in two places at
once: listed under the new parent, findable at the old address.
`moveWithTranslations` writes both or neither.

### The destination is checked the way a new address is

Every language of the page is checked against the destination before
anything is written, by the same rule creating or renaming one obeys —
including, at the root, the dimensions and root-mounted terms that answer
there (ADR-0064). One language refused is the whole move refused.

A page cannot move inside itself or inside one of its own descendants:
the walk up from the destination refuses a ring, because a tree that
closes into one would make every walk of it — resolution, the sitemap,
the editor's own list — either never end or drop the branch.

### It lands last among its new siblings

Order is only meaningful inside one sibling group, so the number the page
carried from the old one would be a collision as often as not.

## Consequences

- A structure can be fixed without losing anything. The pages under a
  moved page move with it, and their addresses change with the prefix;
  their own `formerParents` stay untouched, because they did not leave
  their parent — the answer for them comes from the ancestor's own memory,
  exactly as it does after a rename.
- Two kinds of history now sit on a translation, and a page that was both
  renamed and moved is found through whichever pair was recorded. The
  combination "the slug it had two moves ago, under the parent from three
  moves ago" is not recorded and answers 404: the depth kept is one event,
  not the cross product of all of them.
- A move away from a language that an ancestor does not have leaves the
  page without an address in that language; resolution answers 404 rather
  than redirecting to a path built from two languages.
- The select offers one page of the list (20). A site past that is beyond
  what a dropdown should answer, and the honest fix there is a tree
  screen, not a longer list.
