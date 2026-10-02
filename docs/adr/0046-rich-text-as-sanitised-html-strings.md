# 0046 — Rich text as sanitised HTML strings

**Status**: Accepted — 2026-09-07 · Amended after implementation — 2026-09-07

## Context

Kometio has no rich text. Anywhere.

Thirteen block descriptors declare a `kind: 'textarea'` field, and every one
of them holds a plain string. `Text` renders as `<p>{body}</p>` in
`apps/public-site/src/components/blocks/Text.astro`, where Astro escapes
the interpolation — so markup typed into the field appears on the page as
literal characters. Inline editing in the canvas mounts TipTap with only
`Document`, `Paragraph` and `Text` and calls `editor.getText()`
(`apps/public-site/src/lib/init-preview-bridge.ts`), whose own comment
records the constraint: _"a single paragraph, no marks"_.

The consequence is larger than it sounds: **you cannot put a link inside a
sentence.** Not by using the editor, and not by typing HTML by hand. Nor
bold, italic, or a bulleted list. The only place arbitrary HTML can live is
the `EmbedHtml` block, which renders inside a sandboxed `srcdoc` iframe
(ADR-0025) — so content placed there inherits none of the theme's styles,
is invisible to search engines, and cannot be edited in the canvas. For
body copy that is not an escape hatch, it is a trap.

This surfaced while planning the WordPress importer. A WordPress paragraph
is HTML, and in a real blog most internal links live _inside_ paragraphs —
"as I explained [in this article]", "see the [product sheet]". Importing
such a paragraph into today's `Text` block keeps the words and **silently
drops every link**. On a 300-post blog that is thousands of lost links,
with nothing to indicate the loss. But the gap is not a WordPress problem:
it is a hole in the product that every Kometio user has today.

## Decision

**A new field kind, `richtext`, whose value is an HTML string, sanitised
on write against a strict allowlist.**

### Why a string rather than a document tree

The obvious alternative is to store a structured document (a
TipTap/ProseMirror JSON tree). It is rejected because of a concrete
constraint, not a preference:

```ts
// libs/shared-types/src/lib/field-value-overlay.ts
export const fieldValueOverlaySchema = z.record(
  z.string(),
  z.record(z.string(), z.string()),
);
```

`fieldValues` — the per-locale overlay that makes translation work
(ADR-0034) — maps a block id and a field key to a **string**. A JSON tree
could not be stored there without changing that schema and every consumer
of it, and translation is a load-bearing feature we would be destabilising
to gain nothing at the point of use.

Keeping the value a string means per-locale translation of rich text works
on the day the field kind ships, with no change to the overlay at all.

A secondary benefit, given the importer that prompted this: HTML is also
the format WordPress hands us, so the import becomes "sanitise and keep"
rather than "convert and hope".

### Sanitisation on write, in one place

A new `libs/rich-text` (tag `domain`, its only dependency `sanitize-html`,
already in the repo) exposes `sanitizeRichText(html)` with a **strict**
allowlist — `p br strong b em i u s a ul ol li code sub sup`; on `a` only
`href` (schemes `http(s):`, `mailto:`, and relative), `title`, `rel`,
`target`, with `rel="noopener"` forced whenever `target="_blank"`. No
`style`, no `class`, no `on*`, no `img`, no `iframe`, no `script`.

This is deliberately **the opposite policy** to the only other sanitiser in
the codebase: `EmbedHtml.astro` runs `sanitize-html` with
`allowedTags: false, allowedAttributes: false, allowVulnerableTags: true`,
because there the containment is the sandboxed iframe, not the allowlist.
Reusing that configuration here would be a serious mistake, and the two
must not be confused.

Every content write path in `apps/api` runs the sanitiser: `POST
/page-groups` (which accepts `content`), `PATCH /page-groups/:id/content`,
`PATCH .../field-values`, `PATCH .../diverged-content`, and the
`site-layout-sections` draft save. **A test enumerates the write paths and
fails if one of them does not sanitise** — the contract is "everything
that enters the database is already safe", and a contract with an
unguarded entrance is not one.

In implementation four of the five became structural rather than
enumerated: the sanitising lives in the Zod schema those paths already use
to accept content at all, so a new write path gets it by writing the code
that makes it work. The overlay path cannot be guarded that way — it
records a block ID, and only the group's tree says what type that block is
— so it stays explicit, and the enumerating test walks every exported body
schema rather than a list kept by hand.

**Amended: rendering does NOT simply trust the database.** Sanitising on
write cannot be the only barrier, because the API cannot see a THEME's
blocks: those are TypeScript modules under `themes/<name>/blocks/`,
compiled into the public site by `import.meta.glob` at build time, and a
running Node process cannot load them. A theme's own rich text field would
pass the API unexamined. So the renderer sanitises again, where the
registry is complete — on the per-block path in `BlockRenderer`, so
coverage is by construction. The write-side barrier is still worth having:
it keeps the database clean, which is what the search index, exports and
the API's own responses depend on.

The CSP nonce (ADR-0028) remains a further barrier behind both.

### Scope

All thirteen textarea fields become `richtext`, **except `Code.code` and
`EmbedHtml.html`**, which are literal content by definition and stay plain
textareas.

Applying it to all thirteen rather than only `Text` is a coherence
decision: a user should not have to remember which fields accept a link
and which silently strip one.

**Amended in implementation: eleven, not thirteen.** `PromoBar.message`
stays a plain textarea. It renders inside an `<a>` which is itself inside
a `<p>`, so rich text there would put a paragraph inside a link and a link
inside a link — both invalid — for a one-line promo label with no room for
formatting. The coherence argument holds for body copy; it does not
survive contact with an inline slot.

### Migration

Existing values are plain text that may contain literal `<` or `&`. Read
back through `set:html` they would break or vanish. A one-off script
(modelled on `libs/adapters/postgres-db/scripts/backfill-block-ids.ts`)
escapes each value and wraps it in `<p>…</p>`, treating blank lines as
paragraph breaks. It must be idempotent: a value that is already valid
sanitised HTML is left alone.

**Amended: the same normalisation runs on the read path too, so the script
is tidying rather than a precondition.** Scripts in this repo are executed
by hand (`pnpm db:backfill-block-ids` and friends). A self-hoster who
upgrades without reading the release notes would otherwise find their site
quietly missing text — the worst possible failure for the audience this
product is for. `normalizeRichText` is idempotent by construction, which
is what lets it sit on the write path, the read path and in the script at
once.

## Consequences

- Translation of rich text works unchanged, which was the point of the
  string decision.
- `search-text.ts` must strip tags before indexing, or the search index
  fills with markup. `libs/rich-text` exports `richTextToPlainText` for
  this and for previews.
- The generators that emit content — the first-run wizard's seeded home
  page and the legal-document templates — now emit HTML.
- The canvas gains a real inline editor: TipTap with `Bold`, `Italic`,
  `Link`, lists, and a small bubble menu, switching from `getText()` to
  `getHTML()`.
- **Resolved in implementation** — internal links use a `kometio://page/<id>`
  href, rewritten at render by the same `resolvePageReferences` that
  already resolves the `page` prop. One stored value serves every locale,
  and a page with no translation in the locale being read loses its
  address and keeps its words, which is exactly what the block-prop path
  already does. Verified live: the same stored reference served
  `/en/installation` and `/it/installation`. The original framing of the
  question follows.
- **Open question deliberately left to implementation**: internal links.
  Today a link to a page is stored as `{pageGroupId, title}` and resolved
  at render (`resolve-page-content-references.ts`), so renaming a page
  never breaks it. Inside an HTML string that indirection has no home. A
  convention is needed — something like `href="kometio://page/<id>"`
  rewritten at render — and it should be chosen with the alternatives
  written down, because it is the one part of this decision that can still
  go wrong.
- The empty value stays `''`, not `<p></p>`, so existing "is this field
  empty" checks and defaults keep working.
