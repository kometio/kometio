# 0097 — A core block's design is found by its name; the picker's drawers come from the blocks

**Status**: Accepted — 2026-09-30

## Context

Adding a core block such as `PricingPlan` meant declaring it in about ten
places, and only one of them (`CORE_BLOCK_TYPES`) was checked against the
registry by a spec:

- the schema and `BLOCK_PROPS_SCHEMAS`, the style defaults, the search text;
- the descriptor, and `config.ts` twice more: the import and `pageBlocks`,
  then again in `pageBlockCategories`, where the block's category was written
  a second time beside the one on the descriptor;
- `BlockRenderer.astro` three times: the import of its component, the line
  wrapping it with the theme's override, and its entry in a 630-line dispatch
  table saying whether it takes a style, whether it holds blocks, whether it
  wants the locale, what else it is handed. The file was 1,152 lines, 900 of
  them this.

The dispatch entries repeated what the descriptor says. `stylable` was
`stylableProperties` non-empty on all 101 types that had it; `recurseChildren`
and `containerProps` were `isContainer` on all but five. `locale` was on 68
types, `editable` on 16 more: a second list of what each component's own
`Props` already declares.

## Decision

- **The design of a core block is `components/blocks/<Type>.astro`, found by
  that name** (`import.meta.glob`, `lib/block-dispatch-for-theme.ts`). Nothing
  lists the components. A descriptor without a file stops the site at start,
  and a file without a descriptor fails `block-components.spec.ts`. A component
  that is not a block (`FormField`, `SiteMapTree`) lives in `components/parts/`.
- **The dispatch entry is derived from the descriptor** (`lib/block-dispatch.ts`):
  a style is taken when `stylableProperties` is non-empty; a block holds blocks
  when it `isContainer`, with two named exceptions: a Section's children are
  grafted at read time (ADR-0059), and Nav, HamburgerMenu, NavDropdown and Tab
  hold structure rather than a slot. A block that `rendersFromChildren` is
  handed them as `items`. It is worked out once per theme, with the theme's
  overrides and its own new block types in the same table, instead of once per
  block rendered.
- **Every block is handed the page context** (`locale`, `site`,
  `translations`, `ancestors`, `currentPageTitle`, `editable`): a component
  reads the ones it wants. That is free only while nothing forwards its props
  into markup, which `block-components.spec.ts` holds for core blocks and for
  every theme's overrides. What is genuinely computed stays in one small table,
  `COMPUTED_BLOCK_PROPS` (Columns' tracks, a glossary term's id, the payment and
  share icons).
- **The picker's drawers come from the blocks.** `pageBlockCategories` is
  derived from each descriptor's `category`, in a fixed order of drawers, and
  from the order of `pageBlocks` within a drawer, so a block is in exactly one
  drawer by construction. Three descriptors said something else than the
  drawer they were shown in (Breadcrumb, SocialLinks, SocialLink); their
  category now says where they are.
- **What stays declared by hand, and is held by a spec that names it**
  (`libs/block-sdk/README.md` has the list): the props schema map and the style
  defaults and search text, because `shared-types` is `domain` and cannot read
  the registry that the adapters and the application read them through;
  `CORE_BLOCK_TYPES`, because a theme is built outside the monorepo with the SDK
  and without the registry; and the generation catalogue, which is a curated
  subset with values the server sets, not a copy of the descriptors.
  `block-declaration.spec.ts` closes the one gap: a core type with no entry in
  `BLOCK_PROPS_SCHEMAS` was read by the site as "no schema", and its props went
  unchecked. Every registered type has one, and its own defaults satisfy it.
- **The boundary ADR-0037 draws is the theme's, not the site's.** A theme and the
  SDK must be buildable without `@kometio/block-registry`; `apps/public-site`
  already read it (the descriptor labels and child rules), and comments claiming
  the opposite were corrected.

## Consequences

- A new core block is: its schema and `BLOCK_PROPS_SCHEMAS` entry, its
  descriptor and its place in `config.ts`, `<Type>.astro`, labels, and where
  applicable style defaults, search text and `CORE_BLOCK_TYPES`. Every one that is
  missed fails a spec that says which. The dispatch, the second category list
  and the per-type flags are gone. `BlockRenderer.astro` is 221 lines.
- Measured against the build before the change: all 108 public pages and all
  57 canvas previews are identical apart from the stylesheet. The link order is
  the same (theme blocks, layout, blocks). `BlockRenderer.css` holds the same 636
  rules, now in the order of the components' names instead of the order they were
  once imported in by hand; no selector is defined by two components, so the
  order between them decides nothing. Seven of its rules changed the hash that
  scopes them, because the two partials they belong to moved folder.
- The picker's drawers are the same drawers with the same blocks in the same
  order, checked against the previous lists.
- The guard that a block with a `display` prop was handed `locale` is gone: every
  block is handed it.
