# 0123 — Stored JSON is checked where it crosses the driver

**Status**: Accepted — 2026-10-13.

## Context

Thirty-two columns of `schema.ts` are `jsonb`, and each said what it held with
`.$type<T>()`: a TypeScript annotation, which the driver never looks at. A page's
content, a site's tracker list, a form's fields, a submission's payload — all
came out of Postgres typed as what the code believed they were, whatever had
been written into them by an older version, a script, or a hand with `psql`. The
types of those values are also the ones the API's schemas already describe
(`@kometio/shared-types` has a zod schema for every one of the sixteen shapes);
nothing held the two together at the one place where they meet.

The review of 2026-10-11 listed it as ENG-3: "zod at the boundary, one at a
time".

## Decision

- **A column says what it holds with a schema, and the schema is checked on
  every read and every write.** `validatedJsonb(name, schema)` is a Drizzle
  custom column (`dataType: 'jsonb'`); the check is in its `fromDriver` and
  `toDriver`. Every query that selects the column — from any repository, in a
  transaction or not — gets a value that passed, or an error. Nothing was added
  to the repositories, and a query that does not select the column does not pay
  for it (the integration spec holds that).
- **It validates and does not transform.** The value that comes out is the one
  that is stored, with whatever keys it has. A zod object strips what it does not
  know and a `preprocess` rewrites what it accepts; had the read returned the
  parse, a read and a save would have been a silent rewrite of the data. The
  one cast in the file says so.
- **A value that is not what its column says is an error, in both directions.**
  `StoredJsonInvalidError` names the column and where in the value and why,
  never the value (the content of a page is not for a log). It is not a domain
  error and is not mapped: it is a 500 with a request id, in the log, and — being
  a thing nobody expected — where errors are reported (ADR-0114).
- **The library depends on a shape, not on zod.** `JsonSchema<T>` is `safeParse`
  and the issues it returns, which every zod schema satisfies: `postgres-db`
  stays without the dependency, and the schemas stay in `shared-types` beside
  the types.
- **Five named schemas were added** where a column held a list or a record
  that had no name: `trackerDomainEntriesSchema`, `trackerScriptEntriesSchema`,
  `formerParentLocationsSchema`, `storedFormFieldsSchema` (the _shape_ of a
  form's fields; `formFieldsSchema` adds the rules a save is held to, and a
  form saved before one of them is still a form) and `formSubmissionPayloadSchema`.

## Why an error on a read, and why that is a decision to keep looking at

The alternative that was weighed is to log and pass the value on, and move to an
error once the logs were clean. It is the safer start for a site that is live: a
row written under an older schema would fail one page of a client's site.

No site is live today, which is the cheapest time there will ever be to find
every row that does not pass, and an error is what finds it: in a developer's
database, in the integration suites, in CI. The risk does not go away at go-live;
it changes shape. After it, **a schema that is made stricter than what was
already written is a data migration**, the same as a column that changes, and
`migrate-*` functions of `shared-types` (`migrate-responsive-block-styles`,
`migrate-columns-layout`) are what that looks like. If that discipline ever
costs a page that was readable, the switch to log-and-pass is one function.

## What it found

- **`page_translations.seo_meta` has a default of `{}`**, and `{}` is not a
  `SeoMeta` (a title and a description are required). Nothing writes a
  translation without one — the repositories and the first-run bootstrap always
  give it — so the default was a column that could hold what its type forbids.
  It is kept in the database (no migration; `db:generate` reports none) and
  written as SQL, so that the TypeScript type no longer claims it is a `SeoMeta`.

## Not in this change

- **A page's blocks are checked as a tree, not block by block.** `blockSchema`
  has `props` as a record of unknowns: the tree's shape is what is verified, and
  what each block type's props must be is the API's check on the way in
  (`BLOCK_PROPS_SCHEMAS`). Holding stored props to those schemas would be the
  next step and would read every block of every page; the offline script that
  already walks stored content (`scripts/visit-stored-content.ts`) is where it
  would start.
- **The cost is that of the parse**, measured on a generated page (blocks with
  text, a fifth of them containers of three): 0.04 ms for 20 root blocks,
  0.10 ms for 100, 0.39 ms for 400, on top of the JSON parse. On the public
  site's path at the load that was measured (some 300 pages a second) that is a
  few percent of one core.

## Consequences

- A new `jsonb` column is `validatedJsonb(name, schema)`; there is no way to
  declare one with only a type that is also not the long way.
- The types the repositories hand out now come from the schemas
  (`z.infer`) rather than from a second declaration beside them, and a column
  whose declared type and schema disagree is a compile error.
- A row written by a newer version than the running one (an older image on a
  newer volume) that has a field the older schema does not know passes, and
  keeps it: that is what "validate, do not transform" is for.
