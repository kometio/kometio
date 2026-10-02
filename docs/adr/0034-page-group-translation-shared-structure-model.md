# 0034 — Page content model: `PageGroup`/`PageTranslation` shared structure, replacing per-locale `Page` rows

**Status**: Accepted — 2026-09-01. Amended by [0075](0075-an-unlinked-language-can-be-relinked.md): unlinking a language is no longer irreversible.

## Context

`docs/adr/0017` established locale-prefixed URLs and a `Page.groupId`
join to link "translations of the same page" together — a WPML-style
model, one full `Page` row per locale, each with its own independent
`content` (block tree). That URL shape and the configurable
untranslated-page fallback are unchanged by this ADR (see the pointer
this ADR adds to 0017's Status line); what changed is the storage model
underneath.

The WPML-style model had a real, observed failure mode: adding a block
to one locale's page did not add it to the other locales' pages, since
each locale owned an entirely independent `content` tree. The only
mitigation ever built for this was `Page.syncedStructureSignature`
(`docs/adr` context: PR #102, 2026-08-29) — a hash of block
types/nesting shape (never prop values, so a text-only edit never
false-flags), compared against the group's default-locale page, shown
as a manual "structure may have drifted" badge with a "mark as synced"
button. This was explicitly a safety-net indicator, not a fix — decided
with the user at the time as no-automatic-resync, since merging a new
structure into already-translated text needs a human. It could tell an
editor a page had drifted; it could not stop drift from happening, or
make drift-free translation the default experience.

The user flagged this indicator as insufficient and asked for the
underlying model to be fixed, not further patched. The full plan lived
at `~/.claude-personal/plans/majestic-petting-lampson.md` (a local
planning file, not part of this repository); work happened across
several phases directly on `feature/i18n-page-groups-foundation`,
merged as PR #118 (`728b60f`, "feat: rewrite pages to a
shared-structure + per-locale i18n model", 2026-09-01).

## Decision

**A page's block-tree structure is shared across all locales; only
text/SEO content is per-locale.** `Page.groupId` + N independent `Page`
rows is replaced by two entities:

- `PageGroup` (`libs/domain-core`) — the canonical structure: one
  shared `content: Block[]` tree, plus hierarchy (`parentId`) and
  ordering. There is exactly one `PageGroup` per logical page,
  regardless of how many locales it's translated into.
- `PageTranslation` — one row per `(pageGroupId, locale)`, holding a
  per-locale `fieldValues` overlay (not a second full block tree),
  independent `SeoMeta`, and its own publish status. `FieldValueOverlay`
  - `mergeTranslatedContent` (`libs/shared-types`) merge a
    `PageGroup.content` tree with a `PageTranslation.fieldValues` overlay
    at read time, keyed by `blockId` + prop key.

Which fields are per-locale is declared on the block descriptor itself,
not inferred: `FieldDescriptor.translatable` (`block-registry/src/lib/
field-types.ts`) is a field-level opt-in, deliberately independent of
`inlineEditable` — a field can be free text without being
locale-specific (an external URL typed as `kind: 'text'`), and
conversely translatable without being inline-editable (`alt`, an
attribute rather than a visible canvas node). Structural edits (insert/
remove/reorder/move a block) always write to `PageGroup.content`,
shared by construction — there is no way to structurally fork one
locale by accident any more, since there is only one structure to edit.

### The escape hatch: `isDiverged`

Some pages genuinely need to differ structurally per market (the same
case `docs/adr/0017`'s configurable fallback already anticipated:
"a site with substantially different content per market ... may prefer
the explicit miss over silently serving the wrong language's content").
A `PageTranslation` can be explicitly marked `isDiverged`, at which
point it stores its own independent `divergedContent` and stops
following the shared `PageGroup.content` — a deliberate, irreversible-
in-v1 opt-out (`PageTranslationNotDivergedError` guards the
diverged-only save path), not a silent fork. This replaces the old
model's default behavior (every translation was independently
structural, always) with an explicit choice that most pages never need
to make.

### Rejected alternative: keep per-locale `Page` rows, build auto-resync instead

Considered and rejected before starting: keep the WPML-style model and
build a real merge/auto-resync mechanism for the drift indicator
instead of replacing the storage model. Rejected because the
`syncedStructureSignature` follow-up (PR #102) had already established,
with the user, that automatic structural merging is unsafe without a
human in the loop — an auto-resync mechanism would need to guess how to
reconcile a translator's already-placed text with a newly-inserted
block's position, which is exactly the judgment call the "mark as
synced, don't auto-merge" decision said a human should make. Fixing the
model so drift is structurally impossible for the common case (shared
structure) removes the need for that judgment call entirely for every
page that doesn't explicitly diverge, rather than making the judgment
call easier to exercise.

## Consequences

- `Page.syncedStructureSignature` and the drift-indicator UI/badge it
  powered are gone — made obsolete by the model, not superseded by a
  better version of the same mechanism. A linked (non-diverged)
  translation cannot structurally drift from its group by construction.
- Every write path that used to target `Page.content` now targets
  either `PageGroup.content` (structural edits, shared) or
  `PageTranslation.fieldValues` (translatable prop edits, per-locale) —
  `usePropertyPatch` gained an explicit `changedKey` param specifically
  so the editor can route a single changed field to the correct target
  without needing the full merged props object to decide.
- `PagePickerField`/`linkType: 'page'` (Button/Link/NavLink/Banner/
  PromoBar/PricingPlan) changed its stored shape from a locale-pinned
  `{pageId, locale, slug}` to `{pageGroupId, title}`, resolved to the
  current viewer's locale at render/preview time
  (`resolve-page-content-references.ts`) — fixing a real bug the old
  model had no correct way to express: a link picked once would
  silently reuse whatever locale/slug it was picked in for every other
  locale of the page containing it.
- `SearchPort.indexPage` now takes a `PageTranslation` and
  `page_translations` carries its own `search_text`/`search_vector`
  (new migration), replacing the old `pages`-table-backed index —
  search indexing and the content it indexes now live on the same
  entity.
- No version history exists for `PageTranslation.divergedContent` in
  v1 — `page_group_versions` records structural rollback history for
  the shared `PageGroup.content` only; a diverged translation's own
  edits have no rollback mechanism yet. A deliberate, documented gap,
  not an oversight.
- The old `Page`/`PageVersion` domain entities, their repository ports,
  Drizzle adapters, 16 old-model use-cases, and `PagesController` are
  fully removed, not deprecated in place — `page_groups`/
  `page_translations` are the only page storage from this point on. A
  migration drops the old `pages`/`page_versions` tables and the
  `page_status` enum.
- `docs/adr/0017`'s URL-shape (locale-prefixed URLs) and
  `untranslated_page_fallback` config decisions are unaffected — both
  are still implemented exactly as that ADR describes, just resolved
  against `PageGroup`/`PageTranslation` instead of `Page`. See 0017's
  updated Status line.
