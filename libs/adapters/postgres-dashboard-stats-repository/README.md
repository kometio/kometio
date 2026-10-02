# postgres-dashboard-stats-repository

The Drizzle/Postgres implementation of `DashboardStatsPort` — the numbers
the editor's first screen after login opens with: how many pages are
published and how many are drafts, how much media there is and what it
weighs, how many form submissions have arrived and how many in the last
seven days, plus the pages changed most recently.

## Why it is a Port of its own

Not extra methods on `PageGroupRepositoryPort`, `PageTranslationRepositoryPort`
and `MediaRepositoryPort` — the same reasoning as `SearchPort`. This is a
read-only aggregation across three tables that has no natural home on any
one entity's CRUD-oriented repository, and a deployment that one day
counts these somewhere other than Postgres can replace this single adapter
without touching any of those contracts.

## What it deliberately does not return

A recent submission carries the form's name, the time and nothing else —
no part of the payload. The dashboard is the screen most likely to be left
open on a monitor in a shared room, and a visitor's name and email address
do not belong there. The count and the link are enough to decide whether
to go and read them.

## Tenant scoping

Every query runs through `withTenant()` from
[`postgres-db`](../postgres-db/README.md) like every other Postgres
adapter, so Row Level Security applies to the aggregates exactly as it
does to the rows — see
[ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md).

## Running tests

`nx test postgres-dashboard-stats-repository` runs the unit tests. The
integration spec needs a real Postgres — see
[docs/development.md](../../../docs/development.md).
