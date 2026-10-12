/**
 * The content model: the generic `Block` and the props schema of each block
 * type, in the files they are written in. This file only gathers them, so
 * that what is imported from `./content-model` (and from the package) is the
 * same set it always was.
 *
 * Why several files: this one was 1,388 lines and 65 schemas, and a schema
 * that belongs to one family of blocks was a scroll away from the rest of the
 * family. The families are the ones the editor's picker draws (and the two
 * that already had their own files: `content-and-navigation-blocks.ts`,
 * `commerce-local-content-blocks.ts`).
 *
 * - `block.ts` — the generic format of a block, a page's content, its SEO.
 * - `block-values.ts` — the values several families pick: a page, a media
 *   item, how a collection is shown.
 * - the families: `text-and-media-blocks.ts`, `navigation-blocks.ts`,
 *   `layout-blocks.ts`, `marketing-blocks.ts`, `page-listing-blocks.ts`,
 *   `embed-and-data-blocks.ts`.
 *
 * A family file imports from `block.ts`, `block-values.ts` and its siblings,
 * never from this file: this one re-exports them, and an import the other way
 * would be a cycle.
 */
export * from './block';
export * from './block-values';
export * from './text-and-media-blocks';
export * from './navigation-blocks';
export * from './layout-blocks';
export * from './marketing-blocks';
export * from './page-listing-blocks';
export * from './embed-and-data-blocks';
