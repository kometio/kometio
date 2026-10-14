# 0132 — The core blocks' barrel is generated from the files

**Status**: Accepted — 2026-10-14. Completes what
[0116](0116-a-core-blocks-descriptor-is-built-on-its-contract.md) left
("Not in this change").

## Context

After ADR-0116 a block was named three times in `libs/block-registry`: an
`import` of its file, its name in an `export { … }` list, and its place in
`pageBlocks`. `layout-config.ts` did the same for the blocks of the header and
footer. The place in `pageBlocks` is the order of the picker, which is a
decision. The import and the re-export are not: they say that a file exists.

ADR-0116 left them because the API's webpack bundle cannot take
`import.meta.glob`. A glob at build time was never the only way to stop writing
what the directory says.

## Decision

- **`blocks/index.ts` is generated**, one `export { xBlock } from
'./x.block';` for each `*.block.ts`, by `pnpm run blocks:barrel`
  (`tools/generate-block-barrel.mts`, over `block-barrel.ts`). It is a plain
  static file, so the bundle needs nothing it could not take.
- **A spec fails when it is behind**, naming the command, as the e2e fixture of
  block samples already does (`block-samples.spec.ts`). It also fails for a block
  that is in neither `pageBlocks` nor `headerFooterBlocks`: a file nobody can
  reach is almost always one that was forgotten at the step the barrel cannot do.
- **`config.ts` and `layout-config.ts` read the barrel as a namespace**
  (`blocks.heroBlock`): each block is named once there, in its list, and the
  registry's public exports are unchanged (`export * from './blocks'`).

## Not in this change

- The order of the picker is still a list, by hand. Moving it to an `order` field
  on each descriptor would remove `config.ts` and touch 116 files for a number a
  list says better.
