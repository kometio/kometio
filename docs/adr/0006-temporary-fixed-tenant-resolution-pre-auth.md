# 0006 — Temporary fixed-tenant resolution before auth exists

**Status**: Accepted — 2026-08-17. `StaticTenantContextAdapter` retired as
planned once auth landed — see
[ADR-0010](0010-session-based-auth-foundations.md), which also documents
why `DEFAULT_TENANT_ID` itself survives with a narrower job than "consequences" below assumed.
Both env vars this ADR introduced are now **optional**, and both are
resolved at runtime when absent:
[ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md)
did that for the tenant, and
[ADR-0044](0044-runtime-site-resolution-in-the-editor.md) for the site —
without which the first-run wizard could not produce a working editor.

## Context

The plan says every table is `tenant_id`-scoped from day one, "even if today
it's always the same value" — but doesn't say how that value gets resolved
before Phase 3 (auth) exists. `apps/api` needs a `TenantContextPort`
implementation now, to build and test the pages endpoints, well before a
session/user model exists to derive a tenant from.

Options considered:

1. Seed a fixed tenant + site once, read the tenant ID from an env var.
2. `TenantContextPort` queries `select id from tenants limit 1` — no seed
   step, but fragile on a fresh/empty database and implicit about which row
   is "the" tenant if one ever appeared by accident.
3. Defer all page endpoints until Phase 3 ships alongside real tenant
   resolution — blocks the rest of Phase 2 (Puck integration, public-site
   rendering) on Phase 3 being done first.

## Decision

Option 1. `libs/adapters/postgres-db/scripts/seed-default-tenant.ts` is an
idempotent script that creates one tenant + one site with fixed IDs taken
from `DEFAULT_TENANT_ID`/`DEFAULT_SITE_ID` (not secrets — just UUIDs, safe to
have example values in `.env.example` and literal values in CI). `apps/api`'s
`StaticTenantContextAdapter` (`apps/api/src/app/pages/`) reads
`DEFAULT_TENANT_ID` and implements `TenantContextPort` with it.

## Consequences

- Unblocks Phase 2 API/editor/rendering work without waiting on Phase 3.
- **This is explicitly temporary** — confirmed with the user when this was
  decided. When Phase 3 (auth) lands: replace `StaticTenantContextAdapter`
  with an adapter that derives `tenant_id` from the authenticated
  session/user, drop `DEFAULT_TENANT_ID` from `apps/api`, and retire or
  repurpose the seed script. Don't let it quietly become permanent.
- Every environment (local dev, CI, and eventually any deployed instance
  before Phase 3) needs the seed step run once against its database, or
  every request 404s/fails since the tenant/site rows won't exist.
