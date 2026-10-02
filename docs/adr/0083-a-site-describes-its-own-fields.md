# 0083 — A site describes its own fields, and the import reads them

**Status**: Accepted — 2026-09-25

## Context

ADR-0082 built the analysis and measured two real client sites with it.
One of them arrived at **37% of its blocks convertible**, because 148 of
its 183 blocks are ACF blocks — blocks whose content lives in the JSON
attributes of the block comment rather than in its inner HTML, so the
plan's quarantine, which keeps "the original HTML", would have kept
nothing at all.

The goal this has to meet was stated plainly: _a WordPress site, however
it is built, must bring its pages and what is inside them across —
whether that is ACF or anything else._

What makes that possible is a thing the export already carries and
nobody was reading. A WordPress export contains the **field definitions**
themselves: on that site, 33 field groups and 557 fields, each with its
name, its label, its type and its nesting, and a `location` rule saying
which block or post type it describes. The shape of a site's content
does not have to be guessed or configured, because the site ships it.

## Decision

### The definitions are read, and they decide

`AcfSchemaReader` assembles them while the export streams past — they
arrive as ordinary items in the same file. A value of `"left"` says
nothing about itself; the definition says it is a `select`, which is a
setting, and settings do not become blocks.

That distinction is most of the work. On the site measured, `select` was
the **most common field type of all** (167 of 557), and eleven of the
sixteen fields on its most-used block were settings. One block per field
would have produced page after page of the words "left" and "large".

Where the export describes a block, its description is final: a block
whose fields are all settings — a "latest news" that draws a query —
holds no content, however full any one instance of it looks. Deciding
from the definitions rather than from a sampled instance also means the
answer cannot change with which instance was sampled.

### When nothing describes them, the values are read instead

Four of that site's nine block types have **no field group in the export
at all** — a fifth of every instance — because the theme registers them
in PHP rather than in the database. That is ordinary practice, not an
edge case, and without a second path their words would simply be gone.

So `recoverAcfValues` reads the shape off the values: ACF writes a
`_name` mirror beside every field, which is how the real fields are told
from anything else, and writes a repeater's rows as `name_0_sub` in
order. A `{url, title}` is a link; `"#ffffff"` is a colour; `"0"` is a
checkbox; a key that is or ends in `height`, `size`, `overlay` names a
setting. Everything else becomes text.

When the evidence is thin it errs towards text. A setting that arrives
as a stray word is visible and deletable; a paragraph that never arrived
is neither.

### PHP's serialisation, read here rather than depended on

The definitions are PHP-serialised. Ten lines of format, and no
dependency worth taking — with one trap that has to be got right: a PHP
string declares its length in **bytes**, so `s:6:"Caffè"` is six bytes
and five characters, and a reader counting characters walks off the end
on the first accented word. On an Italian site that is immediately.

## Consequences

Measured on two real sites, before and after. The first is a custom
theme built on fields; the second a shop whose pages are mostly plain
blocks.

|                            | site A             | site B               |
| -------------------------- | ------------------ | -------------------- |
| blocks arriving, before    | 34 of 92 (37%)     | 275 of 335 (82%)     |
| blocks arriving, **after** | **90 of 92 (98%)** | **289 of 335 (86%)** |
| pages arriving whole       | 6 → **12**         | 13 → **16**          |

- What stays quarantined on site A is two blocks that draw a list of
  recent posts, which
  genuinely have no content of their own. That is the right answer, not
  a gap.
- The report gained a category. A block is `native` (it has a Kometio block
  that means the same thing) or `fromFields` (its words and pictures
  arrive, its arrangement does not), and the report says which, and
  whether the shape came from definitions or from values.
- **This is the floor, not the ceiling.** A "stripe with image" arrives
  as a heading, a paragraph, a picture and a button rather than as one
  `MediaText`. Naming a whole block is the mapping layer above this, and
  the report is its worklist: nine block types on site A, all nine with
  an equivalent that already exists.
- `text` fields named like a title become headings. A heuristic, and
  labelled as one — ACF has no heading type, so what somebody called the
  field is the only evidence there is.
- Nothing here writes. The converter takes resolvers for media and pages,
  and during the analysis they answer `null`, which is what lets the same
  code count what it would produce before anything produces it.
