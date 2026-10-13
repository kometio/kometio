# 0124 — Stored block props are audited, offline, against the schemas the site reads them with

**Status**: Accepted — 2026-10-13.

## Context

ADR-0123 made every `jsonb` column check what crosses the driver, and a page's
content is checked there as a _tree_: `blockSchema` has `props` as a record of
unknowns, because what a block's props must be is a different schema for each
of the hundred and sixteen types. Whether `Heading.level` is one of the levels
the code knows, or an `Image` has a media, was not asked of anything that is
stored.

It matters because the answer decides what a visitor sees. The public site holds
a block's props to its type's schema when it draws it, and a block that does not
pass is skipped, alone, with a line in the log (BlockRenderer.astro; the rule
exists because a heading with a level the running code did not yet accept once
blanked every page of the documentation site). A page can therefore be wrong
without being broken: it is served, and a block is not on it.

## Decision

- **`auditBlockProps(content)`** (`@kometio/shared-types`) holds every block of a
  tree to `BLOCK_PROPS_SCHEMAS[block.type]` with `safeParse(block.props)` — the
  call the renderer makes — and returns what it checked, what it refused with
  the issues, and, counted by type, the blocks it had no schema for. It is a
  function of a tree and a map of schemas: a caller with a theme's blocks passes
  them added.
- **`db:audit-block-props`** (`libs/adapters/postgres-db/scripts`) walks stored
  content with the visitor the migrations use and prints, by table and column,
  how many blocks were checked and which were refused, with the row and the
  block's place. It rewrites nothing, and exits 1 when a block does not pass.
  What it prints of stored text (a block's type, id and the keys in an issue) is
  escaped when it holds a character that is not text (a control character, or a
  format character such as a right-to-left override) and cut at a length: a
  newline in a type must not be able to start a line of the report, nor an
  override make one read as another.
- **It is by column** because history is not the site: the versions of a page
  hold blocks as the schemas were when they were written, and a refused block in
  `page_group_versions` is an old version being old, where one in
  `page_translations.published_snapshot` is a page that is online without it.

## What it found

- **The visitor did not visit everything.** `src/lib/visit-stored-content.ts` is the
  one list of where a block tree is stored, shared by the migrations so that none
  keeps its own. It had seven columns and the schema has eleven: reusable
  sections (`content`, `published_content`), their versions, and the diverged
  content of a translation's versions were never on it. The four scripts built
  on it (`migrate-variant-props`, `migrate-columns-layout`,
  `migrate-responsive-block-styles`, `backfill-block-ids`) did not reach them,
  so a Button in a reusable section kept its look in props and drew with none.
  They are on it now, and the visitor is one helper called once per table
  instead of five copies of a loop.
- **A spec now keeps the list whole.** It finds the columns of the schema that
  take a block tree — each `jsonb` column is asked whether it accepts
  `[{ type, props }]` and refuses a `type` that is a number — and fails for one
  that the visitor does not select, or for one it selects that holds no tree.
  Nobody has to remember to add a column, and the spec was shown red against the
  list as it was.
- **Nothing on the write path holds props to their schemas.** The API's request
  schemas take `props` as a record, the sanitiser rewrites rich text and nothing
  else, and the one caller of `BLOCK_PROPS_SCHEMAS` outside the renderer is the
  assembler of a page generated from a prompt. ADR-0123 said "what each block
  type's props must be is the API's check on the way in", and that was true of
  generated pages only; it is corrected there.
- **On the development database** (5,756 blocks checked, one tenant): none of the live content is refused — drafts, published snapshots,
  header and footer — and three blocks in old versions are: two `Image`s saved
  before a media was picked, a `NavLink` whose page reference had lost its title.
  Eight blocks of a theme's own type (`StatusBadge`) were counted, not judged.

## Not in this change

- **No check on the way in.** The editor saves a draft with a block the person
  has not finished (an `Image` before its media), and a gate on a save would
  refuse a page that is a page in progress. The option that is not that is a
  check at _publish_: the blocks the site would skip are named to the person
  publishing, who decides. It is a product decision (what a publish of a page
  with an unfinished block should do) and is not made here.
- **No check on the way out.** Validating props at every read costs a parse of
  every block of every page on the site's hot path, and the renderer already
  does it, once, where the result is used.
- **The image does not carry the script.** It runs from a checkout, as the
  migrations do. A subcommand of the image's CLI (`audit`, next to `export` and
  `backup`) is the way to put it in the hands of someone who runs the image only,
  and would need the schemas bundled where the CLI is.
- **`normalize-rich-text` keeps a walk of its own** (it also rewrites field
  values, which the visitor does not), and that walk does not reach reusable
  sections either. Nothing depends on it — the write path and the renderer
  normalise rich text on their own — so it is named here and left.
- **A theme's own blocks are counted, not judged**: their schemas travel with the
  theme (ADR-0021), which a script outside the site's build cannot load.

## Consequences

- "Does everything that is stored still render?" has an answer that can be asked
  after an upgrade, an import or a hand edit, and says which row.
- A migration written on `visitStoredContent` now reaches reusable sections; the
  transform is also told which table, row and column it is looking at.
- The audit says nothing of content that fails `blockSchema` itself: that is
  ADR-0123's, and it stops the read before this one runs.
