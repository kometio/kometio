# 0059 — Reusable sections, and what a page may change about one

**Status**: Accepted — 2026-09-08

## Context

An agency builds a strip — "Our services": a Container, three columns,
icons, spacing that took an afternoon — and it belongs on eight pages.
Today it gets rebuilt eight times, and when a phone number changes it gets
changed in seven places out of eight.

That is the ordinary reading. The sharper one is that this is Kometio's
positioning turned into a mechanism. The pitch is "the agency builds, the
client runs it themselves for five years" — but today a client can drag
anything anywhere and take the design apart on day one. Nothing stops
them. The promise holds only while the client is timid.

## Decision

### A section is a live reference; a template is a copy

Two kinds, two entries in the menu, not one entry with an option:

- **`shared`** — the page stores the section's **id**. The blocks are
  resolved at read time from the section's published content. Publish the
  section and all eight pages change, with none of them republished.
- **`template`** — the section's published blocks are **copied** into the
  page at insert, with new ids. Nothing links them afterwards.

They are two different promises to the person inserting one, so the menu
has to say which they are getting. Both share the draft/publish cycle:
what a template copies is what its author signed off on, not whatever is
half-finished in the draft.

### The page's snapshot keeps the reference, never the blocks

This is the whole mechanism, and it is the part that is easy to get
backwards. Publishing a page freezes its content into
`publishedSnapshot`, and the public site reads only that. Had section
resolution happened at publish time, editing a section would change
nothing until all eight pages were republished by hand — precisely the
problem the feature exists to remove.

So the snapshot stores the `Section` block with its id, and
`resolveSectionInstances` expands it on every read, from the section's
**published** content. A section's draft is as private as a page's.

Resolution runs **before** page-reference resolution, in the same function
(`resolvePageContentReferences`) rather than being sequenced by each of
the four call sites. A section can hold a Link, and that link needs
resolving in the locale being rendered like any other; the other order
produces a page whose section links all point nowhere, with nothing
failing, only on the pages that use a section.

### Exposed fields: the agency decides, the client cannot widen it

Every field of every block inside a section can be marked "a page may
change this". Everything else — structure, order, styles, adding and
removing blocks — is locked. `exposedFields` lives on the **section**, so
the client cannot grant themselves more than they were given.

The lock is not a matter of hiding buttons.
`collectBlockElements` — the single place every canvas behaviour gets its
elements from — skips everything under a section instance, so selecting,
dragging or deleting one of a section's blocks from a page is not
something the editor declines to do, it is something it never sees.

### An instance's value is one prop, and translation comes free

An instance's override for one exposed field is stored as a **flat prop**
on the `Section` block, keyed `ovr:<blockId>:<field>`.

Flat, and this is the decision the 2026-09-08 discussion settled:
`PageTranslation.fieldValues` overlays whole PROPS by key
(`{...block.props, ...overrides}`), so a nested `overrides` object would
be replaced wholesale by the first locale to touch any single field,
losing the rest. One prop per field means an instance's values are shared
across locales and **translated exactly like any other field**, per field,
with the missing-translation indicator working unchanged — no new
machinery at all.

The keys are checked where they are read, not only where they are
written: `catchall` in Zod validates what a key points at and says nothing
about the key itself, which is how a hostile key would otherwise travel
intact through a schema (the rule PR #144 established).

### A section is edited in its own editor

Not in place on a page, with a warning. Elementor and Webflow both made
that choice, for the reason that decided it here: editing in place on a
page that eight others share is how an accidental change to all eight
happens. A page's Inspector shows a section instance's exposed fields and
a link to the section's own editor, and nothing else.

### Publishing a section re-indexes the pages that use it

Search indexes a page from its published snapshot, and the snapshot holds
a reference where the section's words are. So a section's words reach the
index only through resolution — at page publish, and again for every page
using a section when the section itself is published. Without the second
half, publishing a section would change what eight pages show and leave
the search index describing what they showed before, silently.

Which pages use a section is answered by `collectSectionReferences`, the
same function the renderer uses, over the site's published translations.
Not a `::text like` scan over jsonb pushed into SQL: that would be a
second definition of the same question, correct only because a uuid is
unlikely to collide. The cost is bounded — a site's published pages, on a
person clicking Publish.

### Deleting a section does not rewrite the pages that used it

An instance whose section is gone renders as an empty strip and stays
visible in the editor, where it can be removed or pointed elsewhere on
purpose. Rewriting eight pages on the user's behalf, none of which they
are looking at, is a destructive edit; taking those pages down instead
would turn one wrong click in a list into a site outage.

## The security finding this change surfaced

Auditing which new tables needed a `tenant_isolation` policy showed that
**four existing ones never got one**: `page_groups`, `page_translations`,
`page_group_versions` and `page_translation_versions`, created by
migration 0004 and never added to the baseline's RLS loop. Verified
against a live database — all four came back
`relrowsecurity = false, policies = 0`.

Those four tables hold every page's content. Until now the application's
own `withTenant` filter was the **only** thing keeping one tenant's pages
away from another's, which is the single point of failure
[ADR-0002](0002-non-superuser-role-for-rls-enforcement.md) exists to
avoid — and the deployment bootstrap's own comment already said "the two
page tables" as though the policies were there. The same migration that
adds this feature's tables fixes them, because it is the same statement
for the same reason on the same day, and splitting it would mean shipping
a table with a policy next to four without one.

## Consequences

- Two tables, `reusable_sections` and `reusable_section_versions`, with
  the same draft/publish and keep-last-10 shape as pages and the header.
- `saveVersionTx` in `@kometio/postgres-db` now holds that retention policy
  once. It had been written four times (page groups, page translations,
  layout sections, and pages before the squash); this feature would have
  made it five, which is what made keeping them separate indefensible.
- `SearchPort.indexPage` takes the content to index as a required
  argument. Required and not defaulted: an adapter reading the snapshot
  itself would index a page as though its sections were not on it, and a
  default would let the next caller do that silently.
- `Section` declares `container-type` in `global.css` while being
  `isContainer: false` — the one case where "a block that holds blocks"
  and "a block the editor lets you fill" come apart.
  `container-type.spec.ts` derives its list from `isContainer` and so
  checks this one by name.
- 53 insertable blocks.
- A block on a page can be **turned into** a section from its toolbar: the
  section is created from that block, published immediately, and the block
  is replaced by an instance — one history entry, so an undo does not leave
  the page with neither. Published rather than left as a draft, because the
  page it was taken from would otherwise lose that strip until somebody
  went and published the section, which reads as the button having broken
  the page.
- The canvas is **remounted** rather than patched for that replacement.
  There is no fragment the client could graft in place of the old node: what
  replaces it renders a section, whose blocks live on the server and are
  resolved at read time.
- The sections list shows how many pages place each section, counted with
  `collectSectionReferences` over every page group's content in one query —
  the same function the renderer uses, so the number and the page agree.
  A `template` shows none: inserting one copies its blocks and leaves
  nothing pointing back, so a "0" there would suggest a link that does not
  exist. The count is also in the delete confirmation, because "delete
  this?" and "delete this, which eight pages are showing?" are different
  decisions.
