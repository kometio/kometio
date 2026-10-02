# 0064 — Classification is its own dimension, and a term is an address

**Status**: Accepted — 2026-09-09

## Context

Until now a site classifies content with one field: `pageGroups.parentId`.
That single column does two jobs at once — **hierarchy** (where a page
sits in the tree, which decides its URL) and **classification** (what a
page is about). The consequences are visible in this repo, not
hypothetical: `themes/docs-showcase/regions/ContentShell.astro` builds
the documentation sidebar by filtering `tree.filter(node => node.parentId
=== docsRoot.id)` — a category of our own documentation **is a page**,
because there was nothing else for it to be.

Two limits follow. A page can be in exactly **one** category, and that
category is baked into its address. An espresso machine that belongs in
"Family: automatic" _and_ "Category: professional" has nowhere to say so.

This decision is the first step of Fase 8: the schema, its constraints
and its tenant isolation. No API, no editor, no routes yet — those come
next, on top of this.

## Decision

### Four tables, and terms are agnostic about what carries them

`taxonomies` (a dimension: Category, Family, Tag), `terms` (a value
inside one), `term_slugs` (a term's address, one row per language) and
`page_group_terms` (which pages carry which terms).

Nothing in `terms` knows what a term is attached to. Pages join through
`page_group_terms` today; products will join through a table of their own
later, against these same terms. One place where the agency defines its
dimensions, whatever gets classified.

`page_group_terms` hangs off the **group**, not the translation, exactly
as `parentId` does: the Italian and the English version of an article
belong to the same categories.

### Names are JSONB, addresses are rows

A term's `name`, `description` and `seoMeta` are locale-keyed JSONB. A
term has no draft, no published snapshot, no structure and no version
history, so a translation table would carry machinery that never turns —
it is a concept, not a piece of content.

The slugs are the exception, and for a database reason rather than a
modelling one: **Postgres cannot enforce "unique per locale" over a JSON
map** whose keys are whatever languages the site happens to have. A name
can afford to collide; an address cannot, because a duplicate address is
one URL opening the other term. So slugs live in `term_slugs`, one row
per language, where a real unique constraint can exist.

### The constraint is keyed on the route, not on the taxonomy

The plan called for uniqueness per `(taxonomy, parentId, locale)`,
sibling-scoped like a page's. That is not the same thing as "no two terms
answer at the same address", and the difference bites twice:

- With `taxonomies.slug = null` a dimension's terms are mounted at the
  site root. Two dimensions may both be mounted there — that is the
  "pretty URL" case the plan explicitly wants — and sibling-scoped
  uniqueness would let each of them claim `/it/caffe`.
- A term's URL is `/{locale}/{prefix}/{slug}`, **flat**: the ancestors
  are not in the path (the plan's "via semplice", chosen here). So a slug
  repeated under a different parent is a second name for one address.

The constraint is therefore on `(tenant, site, locale, route_prefix,
slug)`, where `route_prefix` is `taxonomies.slug` denormalized onto the
slug row — rewritten for a dimension's terms when its prefix changes. A
unique constraint cannot reach through a join in Postgres; this is the
same price `page_translations.parentGroupId` already pays, for the same
guarantee.

It is also deliberately the **stricter** of the two rules the plan
allowed. Relaxing a constraint later is always possible; tightening one
over data that already violates it is not — so if term paths ever gain
their ancestors, this loosens without a data repair.

`UNIQUE NULLS NOT DISTINCT`, because `route_prefix` is null for every
root-mounted dimension and Postgres treats NULLs as distinct by default:
a plain unique would have let exactly the dangerous duplicates through,
silently. Postgres 15 introduced it and this project runs 16 in
development, in `docker-compose.yml` and in production; the older
workaround — a second partial index, as `page_translations` uses — is not
needed here.

### Deletes preserve addresses and children

- `terms.parentId` is `ON DELETE SET NULL`: deleting "Machines" promotes
  "Espresso machines" to the top of its dimension rather than taking it,
  and every page filed under it, along.
- `terms.landingPageGroupId` is `ON DELETE SET NULL`, which is what makes
  the plan's "render in place, never redirect" promise hold: delete the
  hand-built page and the term's URL keeps working, falling back to the
  default layout. A partial unique index also keeps one page from being
  the landing of two terms — that would be the duplicate content the
  render-in-place rule exists to avoid.

### RLS from the first migration, join table included

All four tables get `enable`/`force row level security` and the same
`tenant_isolation` policy as everything else, in the migration that
creates them — not in a later one, which is how `page_groups` and its
three companions went five months without a policy (ADR-0059's migration
is where that was found and fixed).

`page_group_terms` carries its own `tenant_id` although it could reach
one through either foreign key. Without a column of its own it cannot
have a policy, and a join table is where a missing one is least visible:
a row saying "this page is in that category" leaks both facts at once.

## Consequences

- Nothing reads these tables yet. The next steps are the domain and use
  cases, the API, the editor's "Classification" section, and the public
  routes with their default layout.
- The cross-table validation the plan calls for — a term slug that
  collides with a **root page's** slug, which becomes likely the moment a
  dimension is mounted at the root — is not expressible as a constraint
  and belongs to those use cases. It is named here so it is not
  discovered in production.
- Verified against a real Postgres, not by reading the SQL: nine
  integration tests assert which inserts the database itself refuses, and
  the `NULLS NOT DISTINCT` one was proven by replacing the constraint
  with a plain unique and watching that test — and only that test — fail.
  The whole migration chain was replayed on an empty database, and
  `kometio_app` came out with the four grants it needs.
