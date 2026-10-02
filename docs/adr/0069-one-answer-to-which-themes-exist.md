# 0069 — One answer to "which themes does this deployment have"

**Status**: Accepted — 2026-09-09

## Context

`KOMETIO_THEME` is documented, in `docs/self-hosting.md` and in
`themes/README.md`, as the knob "an agency sets so its client can only
ever pick the agency's own theme".

It did not do that. `apps/public-site` applied the allow-list to what it
would render; `apps/api` — which populates the editor's theme picker
through `FilesystemThemeCatalogAdapter` — had never heard of the
variable (`grep -rn KOMETIO_THEME apps/api/src` returned nothing). So the
picker offered every theme whose manifest was in the image, and choosing
an excluded one saved happily and then rendered as the fallback theme,
with no error in the editor, in the API, or on the page.

It was found while rewriting the theme documentation: the page being
written had to describe what actually happens, and what actually
happened contradicted three places that promise otherwise.

## Decision

**One function, applied on both sides.** `applyThemeAllowList` moves to
`@kometio/shared-types`, which both apps already depend on, and
`FilesystemThemeCatalogAdapter` takes the raw `KOMETIO_THEME` value as an
option and filters what it lists.

The rule is unchanged, including its escape hatch: an allow-list naming
nothing that is actually present — a typo, or a theme dropped from a
later release — degrades back to "every theme present" rather than
leaving a deployment with nothing it is allowed to choose.

`KOMETIO_THEME` stays **optional** and is read with `process.env` rather
than declared required in the API's env schema: a deployment that never
narrows its themes should not have to set a variable to say so.

## Consequences

- The promise in the documentation is now true, which is the only
  reason this is worth a change rather than a footnote: a doc page
  explaining that a product setting half-works is a worse artefact than
  the setting working.
- The picker in an existing deployment that sets `KOMETIO_THEME` will get
  shorter after this ships. A site already pointing at an excluded theme
  keeps rendering exactly as it did — the fallback — and now the editor
  agrees with the page instead of contradicting it.
- Found by writing documentation. Worth saying plainly: three separate
  documents described this behaviour and none of them was checked
  against the code until somebody had to write the page that a reader
  would follow.
