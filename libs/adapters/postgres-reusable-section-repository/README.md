# @kometio/postgres-reusable-section-repository

Drizzle/Postgres adapter for `ReusableSectionRepositoryPort` and
`ReusableSectionVersionRepositoryPort` (docs/adr/0059) — the strips of
blocks an agency builds once and places on many pages.

Connects as `kometio_app`, never as the migration superuser: the
`tenant_isolation` policy on `reusable_sections` and
`reusable_section_versions` only protects anything because of that
(docs/adr/0002).

Version retention is not implemented here — `saveVersionTx` in
`@kometio/postgres-db` holds the keep-last-10 policy shared with the page
and layout-section version tables.
