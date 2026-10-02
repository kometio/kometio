# rich-text-editor

One TipTap extension set, `RICH_TEXT_EXTENSIONS`, shared by the two places
a person can type rich text in Kometio. It is the editing half of
[`rich-text`](../rich-text/README.md), which owns the format itself.

## Why it is a package and not a constant in one app

The same text is edited from two sides:

- the inspector's rich-text field in `apps/editor-app`, and
- **in place on the canvas**, which is really the preview iframe served by
  `apps/public-site` and driven over `postMessage` (ADR-0028).

If those two loaded different extensions, the same paragraph would gain or
lose marks depending on which one you happened to use — the classic way a
content model rots. Sharing the array makes that impossible.

## Why it re-exports the extensions too

Each TipTap extension declares its commands by **augmenting**
`@tiptap/core`, and a module augmentation only applies where that module
is part of the program. A consumer importing only the array and then
calling `toggleItalic()` gets "Property 'toggleItalic' does not exist".
Re-exporting the extensions from here means one place depends on the
fifteen TipTap packages instead of every app depending on them again for
their types.

## What the set allows

Exactly what the format allows, no more: paragraphs and hard breaks, bold,
italic, underline, strike, inline code, links, bullet and ordered lists,
subscript and superscript, plus undo/redo. Headings, images and tables are
blocks in this product, not text marks — see `rich-text` for why that line
is drawn where it is.

## Running unit tests

Run `nx test rich-text-editor` to execute the unit tests via [Vitest](https://vitest.dev/).
