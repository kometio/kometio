# 0065 — Where the address rule lives

**Status**: Accepted — 2026-09-09

## Context

ADR-0064 created the taxonomy tables and named what it could not
enforce: a term's address and a page's address are rows in different
tables that meet only in a URL, so no constraint can compare them. This
decision is the layer above — domain, use cases, repository and API —
and it is where that comparison finally happens.

## Decision

### One port for terms and their dimensions

`TaxonomyRepositoryPort` covers both, rather than a port each. They are
one aggregate in practice: changing a dimension's prefix rewrites the
address of every term under it, and a term's address row means nothing
without the dimension it hangs from. Two ports would put that
transaction in a use case, which is exactly the coordination a
repository exists to hide.

### The entity says `prefix` where the column says `slug`

Every other `slug` in this codebase is the last segment of an address.
A taxonomy's is the first, and a taxonomy has no address of its own at
all — only its terms do. The column keeps the name the plan gave it; the
entity, which is what the rest of the code reads, says what it is.

### An address is checked in three places, and only one of them can be a constraint

- **A term asking for an address** — refused if another term answers
  there (the database refuses this too; the check exists so the answer
  can name what is in the way), or if a **root page** does.
- **A dimension asking for a prefix** — refused if another dimension has
  it, or if a root page answers to it **in any language the site
  publishes**. That last part is why the use case needs the site: a
  prefix is one string for every locale, so it has to be free in all of
  them.
- **A root page asking for a slug** — refused if a dimension or one of
  its root-mounted terms already answers there.

The third one is not symmetry for its own sake. Without it terms would
refuse to land on pages while pages landed on terms freely, and which one
won would depend on the order the router happened to try them.

Only pages with **no parent** are checked. A nested page's address begins
with its ancestors' slugs, and nothing but a page can own that first
segment — because a taxonomy prefix is refused as a root page slug in the
first place.

### Slugs are derived server-side, from the name, per language

`slugify`, the same function a page's slug goes through, applied to
whatever arrives — a client-computed slug is a suggestion, not a fact. A
name written in three languages produces three addresses; a language the
name has not been written in yet simply has none, which is a legitimate
state and not an error.

An empty result becomes **no prefix at all** rather than an empty
segment: `/it//espresso` is not an address anyone meant to create.

### What deletes and moves do

- Deleting a dimension takes its terms and their addresses with it (the
  database cascades) and leaves every page standing. A classification is
  a view over content, never the content.
- Moving a term to another parent leaves its address untouched, because
  the address never contained the ancestors — that is the whole return on
  ADR-0064's flat form.
- A move is refused if the new parent is one of the term's own
  descendants (the branch would detach from its dimension entirely) or
  belongs to a different dimension (that is two edits, and doing it
  silently would take the term's address with it).
- Turning nesting off on a dimension whose terms already nest is
  refused rather than flattening them. Flattening would move content
  nobody asked to move.

### 409 for a taken address, 400 for an impossible one

A conflict is something the caller can act on by picking another name.
A term descending from itself, or a parent in a flat dimension, is not
occupied — it is shaped wrong, and no other name fixes it.

## Consequences

- `createPageGroupTranslation` gained a required `taxonomyRepository`
  dependency. Required and not optional on purpose: an optional one is a
  rule that can be skipped by forgetting to wire it, and the seven test
  setups that had to be updated are the cheap version of that discovery.
- Nothing renders a term yet. The public routes, the default layout and
  the editor's classification panel are what Fase 8 still owes, and the
  phase's docs page comes with them.
- Verified through the real HTTP stack against a real Postgres: six
  integration tests covering the full cycle (dimension → term → re-file →
  page assignment), both directions of the page/term collision, the
  cycle refusal, and a prefix change moving every term under it.
