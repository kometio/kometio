# postgres-redirect-repository

Drizzle-backed persistence for redirects and for the addresses visitors asked
for and the site did not have — implements
[`RedirectRepositoryPort`](../../ports/src/lib/redirect-repository.port.ts)
(`DrizzleRedirectRepository`, table `redirects`) and
[`MissingPathRepositoryPort`](../../ports/src/lib/missing-path-repository.port.ts)
(`DrizzleMissingPathRepository`, table `missing_paths`), see
[ADR-0127](../../../docs/adr/0127-redirects.md).

## Two repositories, two lifecycles

A **redirect** is a site's own content: a person wrote it, it travels in an
archive, and one address has one rule (`redirects_site_source_unique`, which
`add` and `save` turn into `RedirectSourceTakenError`).

A **missing path** is a moment's: a count that the public site's traffic
writes, in batches, and that a person reads once after a migration. It is not
carried in an archive, and it is capped per site (`MAX_MISSING_PATHS`), so a
scanner that tries a thousand addresses cannot fill the table.

Both write counts as `hits = hits + n` rather than as a value read and written
back, so that two API processes flushing at once add up instead of one undoing
the other.
