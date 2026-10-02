# rich-text

What a rich text value in Kometio is allowed to be, and the code that makes
any stored value into one. No editor here — that is
[`rich-text-editor`](../rich-text-editor/README.md); this package is the
format itself, which is why it can be imported by a Node server as easily
as by a browser.

## The rule it encodes

A rich text field holds enough to write a paragraph — emphasis, a list,
and above all **a link inside a sentence**, which Kometio previously had no
way to express at all (see
[ADR-0046](../../docs/adr/0046-rich-text-as-sanitised-html-strings.md)). It holds nothing
else: no `img`, no `iframe`, no `table`, no `h1`-`h6`.

Those are **blocks** in this product. They have their own descriptors,
their own styling and their own row in the Layers panel. Letting one in
through a text field would produce content the canvas cannot see, select
or edit — visible on the published page and invisible to the person who
owns it.

## What is in it

- `sanitizeRichText` — the allow-list. The single definition of what
  survives, applied on the way in.
- `normalizeRichText` — turns any stored value into valid, safe rich text,
  including plain text written before the field ever became rich. Its tag
  list is built from the sanitiser's, so a tag can never be permitted by
  one and unknown to the other.
- `richTextInContent` — answers "is this field's value rich text?" for one
  block type. The set of block types is passed **in** rather than read
  from a registry here, because the two callers legitimately know
  different sets: `apps/api` knows the core blocks, while
  `apps/public-site` knows those plus whatever the active theme adds —
  TypeScript modules under `themes/<name>/blocks/` collected by
  `import.meta.glob` at build time, which a compiled Node process cannot
  load at runtime. That is the whole reason the API cannot be the only
  place this happens.

## Used by

`apps/api` (sanitising what a browser sent) and `apps/public-site`
(normalising what the database holds before it renders). Not
`apps/editor-app`, which works against the editor package instead.

## Running unit tests

Run `nx test rich-text` to execute the unit tests via [Vitest](https://vitest.dev/).
