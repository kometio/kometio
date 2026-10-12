# 0115 — A block is declared once, as a contract, and the lists are derived

**Status**: Accepted — 2026-10-12. Builds on
[0007](0007-nested-block-content-model-independent-of-puck.md) and
[0037](0037-block-sdk-third-party-block-extensions.md).

## Context

What the site, the API and the editor's tooling know about a core block type
was kept in lists, each keyed by the type's name and each in its own file:

- `BLOCK_PROPS_SCHEMAS` — the schema its props are checked against;
- `BLOCK_STYLE_DEFAULTS` — what its component falls back to for each
  stylable property;
- `PROSE_FIELD_EXTRACTORS` — what search reads of it, or, for a block
  with no prose, an entry in `BLOCKS_WITHOUT_SEARCHABLE_TEXT`;
- `CORE_BLOCK_TYPES` and `CORE_BLOCK_VARIANTS` in `@kometio/block-sdk` —
  literal copies, because the SDK may not read the registry.

A block missing from one of them was found by a spec, after the fact, and
two of those specs exist because it had already happened: Heading shipped
without being indexed (2026-09-01), and eight blocks were written and
rendered and could not be inserted. The walk-through for adding a block
(`libs/block-sdk/README.md`) listed seven steps, four of which were "add
the block to a list": the props schemas, `CORE_BLOCK_TYPES`, the style
defaults, search.

## Decision

- **A core block's shared facts are one object, beside its props schema**:
  `defineBlockContract({ type, props, style?, search, variants? })`, in the
  file of the block's family in `libs/shared-types/src/lib/`. `search` is
  required and is either the function that returns the block's prose or
  `{ none: 'why it has none' }`: not deciding is a compile error.
- **Each family file ends with its list** (`TEXT_AND_MEDIA_BLOCK_CONTRACTS`,
  …) and `block-contracts.ts` gathers them into `BLOCK_CONTRACTS`. A new
  family file is one line there.
- **The lists are derived, never edited**: `BLOCK_PROPS_SCHEMAS`,
  `BLOCK_TYPES`, `BLOCK_STYLE_DEFAULTS`, `SEARCHABLE_BLOCK_TYPES`,
  `BLOCKS_WITHOUT_SEARCHABLE_TEXT`, `BLOCK_VARIANTS` — and block-sdk's
  `CORE_BLOCK_TYPES` and `CORE_BLOCK_VARIANTS`, which read them. Block-sdk
  already depends on `shared-types` at run time (the style override schema,
  the custom field controls) and a theme has both; what it may not read is
  `block-registry`, and it does not.
- **The contract lives in `shared-types`, not in the registry**, because the
  public site must not import React
  ([0007](0007-nested-block-content-model-independent-of-puck.md)) and the
  API's bundle must not pull the editor in. What only the editor needs about a
  block — its fields, icon, category, labels — stays on its descriptor in
  `block-registry`.
- **The one cast**: `BLOCK_PROPS_SCHEMAS` is `Object.fromEntries` of the
  contracts, typed by a mapped type (`BlockPropsSchemas`) that TypeScript
  cannot derive from a list on its own. It is a single, commented cast, and
  the keys it hands out are held to the contracts' by a spec.
- **What derivation cannot see is held by `block-contracts.spec.ts`**: a type
  declared twice (the later would shadow the earlier in every derived list),
  and a contract that is exported by a family file and named in no list. The
  second was shown to fail by taking one contract out of its list.

## Equivalence

Before this change, with the base branch's own `index.ts` kept beside the
new one, a throwaway spec compared them: the 116 types and their props
schemas (the same JSON schema for each), the style defaults (116 entries,
deep equal), the two search lists (67 and 49, the same members), the
variants (Card, Banner, Button, Feature, the same values) and the search
text of every type for a block filled from its schema and for an empty one.
They are equal. What changed is the **order** of `BLOCK_TYPES`,
`BLOCK_PROPS_SCHEMAS` and `BLOCK_STYLE_DEFAULTS` — families rather than the
old hand-kept order — which no consumer reads: they look a type up, or build
a record from the entries.

## Not in this change

- **The descriptor does not take its contract.** A `.block.ts` still writes
  its `type` and `defaultStyle: BLOCK_STYLE_DEFAULTS.Hero`, and
  `core-block-types.spec.ts` and `config.spec.ts` hold them to the
  contract's. It is nearly a pure derivation — 127 of the 128 entries of
  `pageBlocks` and `headerFooterBlocks` (116 types, a few listed in both)
  list their `stylableProperties` in exactly the order of their contract's
  `style` — but not wholly: Anchor has style defaults for the site and no
  style panel in the editor, so `stylableProperties` is a decision of the
  descriptor, not a consequence of the contract. What deriving the rest
  would buy is a failure moved from CI to the compiler, in 116 files; it is
  left until that is worth the churn, and would be its own change.
- **The flags kept as lists elsewhere** — `COMMERCE_BLOCK_TYPES`,
  `SERVER_FILLED_BLOCK_TYPES`, the article blocks — are candidates for a
  contract field the same way; each is a question of its own (what counts
  as commerce is, by that file's own account, still open).
- **The registry's own registration** (`pageBlocks`, an import and an entry
  per block) stays explicit: the API's webpack bundle cannot use
  `import.meta.glob`, and an explicit list is what the specs read.

## Consequences

- Adding a core block is: a schema and a contract in a family file, a
  descriptor, a component, labels. The steps that were "add it to a list"
  are gone, and the one that remains a decision (what search reads) cannot
  be skipped.
- A block cannot be known to the site and not to the API, or to block-sdk
  and not to the site: they read the same object.
- `libs/block-sdk/README.md`'s walk-through is five steps instead of seven,
  and the failing-check table says which check holds each.
- A contract is longer than the schema it sits beside, by its style defaults
  and its `search`; the family files grew by the lines the lists lost.
