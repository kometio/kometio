# 0116 — A core block's descriptor is built on its contract

**Status**: Accepted — 2026-10-12. Amends
[0115](0115-a-block-is-declared-once-as-a-contract.md), whose "not in this
change" first item this is.

## Context

[ADR-0115](0115-a-block-is-declared-once-as-a-contract.md) made the lists
the site, the API and block-sdk keep derive from each block's contract. The
editor's descriptor (`blocks/<name>.block.ts` in `@kometio/block-registry`)
still wrote three things the contract already says:

- `type: 'Hero'`;
- `defaultStyle: BLOCK_STYLE_DEFAULTS.Hero`, a lookup by that same string;
- `stylableProperties`, 83 times a literal list and 33 times
  `BlockStyleRegistry.STANDARD` (a class with one static array, kept so that
  33 blocks did not copy it).

Specs held each to the contract's: `core-block-types.spec.ts` (the types),
and `config.spec.ts` (a block's `stylableProperties` are exactly the keys of
its defaults). A property added to one side and not the other failed CI, and
nothing before that.

## Decision

- **`coreBlock(contract, config)`** (`libs/block-registry/src/lib/define-core-block.ts`)
  builds the descriptor. `type` is the contract's; `defaultStyle` is the
  contract's `style`; `stylableProperties` is, unless the config gives its
  own, the keys of that `style` — a block that declares a default for a
  property offers it, and cannot offer one it has no default for. What a
  descriptor writes is what only the editor knows: label, category, icon,
  defaults, fields, containment.
- **A block with defaults for the site and no style panel says so**:
  `stylableProperties: []`. Anchor is the one — its `maxWidth: 'none'` is for
  the site's wrapper, and offering a width control on a point in the page
  would do nothing.
- **`BlockStyleRegistry` is gone.** The five properties it listed are the
  `style` of each contract that wants them, with the default each has.
- **The reasons for a set moved with it.** Sixteen descriptors had a comment
  on their list, most of them saying why a property is left out ("No
  textColor: the Shiki theme already sets the syntax colors", "No radius: a
  rule frames the quote"); they are now above the contract's `style`, where
  the set is declared, and the one inside Hero's list is above its
  `contentAlign`.
- **Two files are not built with it, and say why.** `section.block.ts`: its
  props are declared by hand as `SectionProps` because `z.infer` of its
  `catchall` schema contradicts itself, and `coreBlock` types `defaultProps`
  by the inference; it reads `type` and `defaultStyle` from the contract
  directly. `callout.block.ts` is the worked example of `defineBlock()` in
  `libs/block-sdk/README.md`, the surface a theme's own block gets, and stays
  on it.
- **The specs hold what is still a choice**: a property a block offers has a
  default (`config.spec.ts`), a descriptor's `defaultStyle` is its contract's
  object and not a copy, and every file of `blocks/` exports exactly one
  descriptor and is listed (read from the modules; the spec used to scrape
  `type: '…'` out of the text, which is no longer there).

## Equivalence

The 128 entries of `pageBlocks` and `headerFooterBlocks`, serialised with
their keys sorted before and after, are byte-identical (157 KB) except for
Countdown's default date, which is "now plus thirty days" computed when the
module loads. 127 of the 128 listed `stylableProperties` in exactly the order
of their contract's `style`; the 128th is Anchor.

## Not in this change

The registration in `config.ts` is still three mentions per block — the
import, the name in `export { … }`, and its place in `pageBlocks`. The place
is the order of the picker, which is a decision; the import and the export
are not, and the API's webpack bundle cannot take `import.meta.glob` to
replace them.

## Consequences

- A rename of a block's type is one edit, in its contract.
- Adding a block's style defaults to its contract is what makes the editor
  offer the controls; there is no second list to keep in step.
- 114 descriptors are shorter by their `type`, `defaultStyle` and
  `stylableProperties`: `blocks/` loses 1,241 lines and gains 517 (the
  imports, and the comments that moved are counted on the other side).
