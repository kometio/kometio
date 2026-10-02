# 0075 — An unlinked language can be relinked, and its own content has a history

**Status**: Accepted — 2026-09-18

## Context

A page's languages share one structure: the blocks live on the
`PageGroup`, and each `PageTranslation` lays its text over them
(`fieldValues`). A language can be unlinked (`diverge`): it takes a full
copy of what it shows and from then on keeps its own tree in
`divergedContent`, with blocks the other languages do not have.

Unlinking was a one-way door. The entity said so ("irreversible in v1"),
because it was not obvious which side should win on the way back. And
the unlinked tree had no history at all: `saveDivergedPageTranslationContent`
wrote the row and nothing else, with a comment calling the missing history
"a known, deliberately deferred gap". So the row was the only copy of an
unlinked language's work, and the editor's version history (which showed
the shared structure only) had nothing to offer for it.

## Decision

### Relinking keeps the text of every block that still has somewhere to go

`relinkedOverlay` (in `@kometio/shared-types`, the inverse of
`mergeTranslatedContent`) turns the fork back into an overlay. A block of
the fork keeps its text when the shared structure still has that block,
matched by id and type, and only for the fields its descriptor declares
`translatable`. A value equal to the shared one is not recorded, since an
absent entry inherits it anyway.

What is dropped is everything else the fork had: blocks that exist only in
that language, and every non-text change (images, settings, layout), which
go back to the shared ones. The confirmation dialog says so before it
happens, with the number of blocks that will be removed.

### The overlay is computed in the editor, not in the API

Which fields carry over depends on which fields each block declares
translatable. The editor knows this for every block, including a theme's.
A running API knows the core registry only: theme blocks are compiled into
the public site (see `sanitize-page-content.ts`). Computing the overlay
server-side would silently drop the text of every theme block.

So `POST /page-groups/translations/:id/relink` takes the overlay, sanitises
it against the group's tree like any other save of a language's text, and
`relinkPageTranslation` applies it. The editor needs the same computation
anyway, to count the blocks it would drop.

The editor waits for pending saves before relinking. It refuses when one of
them failed, and it reads the fork from the cache, not from the render that
opened the dialog. Relinking from a tree the server never received would
carry over text that is not there.

### Every change to a language's own content is a version

`page_translation_versions` gains `diverged_content`, null while the
language follows the shared structure. Diverging, saving the fork,
relinking and restoring all record a version through
`PageTranslation.toVersion`, the one place that decides what a version of a
language holds.

The rule this buys: a language's newest version is always what it shows. So
relinking needs no snapshot of its own. The fork it lets go of is already
the newest version, and restoring that version unlinks the language again
with it. The migration gives every language already unlinked that version,
since until then none of them had one.

### Restoring a version restores its shape too

`rollbackPageTranslationToVersion` puts back what the version holds. If the
version was taken while unlinked, the language is unlinked again with that
tree. If it was taken while linked, the language is linked again with that
text. SEO fields stay as they are now: they are read live, and a restore
that also rewrote the search title would change something the person did
not look at.

### The history shows both streams where both apply

The version dialog gains sources. A linked language shows two histories: the
shared structure (all languages) and its own text. An unlinked language
shows only its own, because the structure no longer reaches it and
restoring it would change every other language and leave this one as it
was. The site's own language shows its history only once it has one: its
text lives in the structure, so its own stream holds only forks. A version
that would unlink the language says so beside its date.

## Consequences

- Unlinking is reversible, and the diverge dialog no longer says it cannot
  be undone.
- The retention of ten versions per language now applies to unlinked edits
  too. A fork edited more than ten times keeps only its last ten states.
  This is the same limit every other stream has.
- The overlay a relink records is only as complete as the editor's registry
  at that moment. A theme block whose descriptors fail to load falls back
  to core-only, and its text is not carried over. The fork stays in the
  history, so restoring it and relinking again recovers the text.
