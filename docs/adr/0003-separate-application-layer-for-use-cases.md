# 0003 — Separate `application` layer for use cases

**Status**: Accepted — 2026-08-17

## Context

The plan describes `libs/domain-core` as "pure entities... zero dependencies on
Postgres/Express/Puck", and `libs/ports` as the interfaces the adapters implement
(`PageRepositoryPort`, `MediaStoragePort`, ...). It doesn't say, however, where the
**use cases** live (`create page`, `save draft`, `publish page`, `list versions`,
`rollback to version`), which necessarily depend on both the domain entities and
the Ports they orchestrate.

Putting the use cases inside `domain-core` creates a circular dependency: `ports`
must import entity types from `domain-core` (e.g. `Page` as the return type of
`PageRepositoryPort.findById`), but if `domain-core` in turn imports
`PageRepositoryPort` from `ports` for its use cases, the two packages depend on
each other.

Options considered:

1. New `libs/application` library (use cases), depends on `domain-core` + `ports`.
2. Use cases as NestJS services inside `apps/api`, no new library.
3. The Ports the domain needs (`PageRepositoryPort`, `PageVersionRepositoryPort`)
   co-located inside `domain-core` itself (the classic hexagonal architecture
   layout, where the domain owns the ports it consumes); `libs/ports` becomes a
   re-export of those plus the ports the domain never orchestrates directly
   (`MediaStoragePort`, `AuthPort`).

## Decision

Option 1: new `libs/application` library.

- `domain-core`: pure entities only (`Page`, `PageVersion`, `User`, `Media`,
  `FormSubmission`) and domain errors. Zero dependency on `ports`.
- `ports`: depends on `domain-core` for the types used in its signatures, defines
  `PageRepositoryPort`, `PageVersionRepositoryPort`, `MediaStoragePort`,
  `AuthPort`, `TenantContextPort`.
- `application`: depends on `domain-core` + `ports`, contains the use cases as
  plain functions `(deps, input) => Promise<Output>` — testable in isolation with
  in-memory repositories, no NestJS involved.
- `apps/api`: depends on `application` + `ports` + the concrete adapters, does the
  DI wiring (Nest injects the concrete implementations behind the Port
  interfaces).

## Consequences

- No circular dependency between libraries.
- Use cases stay testable without a framework (see
  `libs/application/src/lib/use-cases/page-lifecycle.spec.ts`, the end-to-end
  draft → publish → rollback test with a fake repository).
- Adds a library not explicitly listed in the original plan's "indicative" tree —
  accepted because the plan itself describes `domain-core` as "pure entities", so
  the use cases were never meant to live there anyway; `application` simply names
  the application layer that hexagonal architecture always has.
- Later phases (media, forms, auth, i18n) will add their use cases here, not
  inside `domain-core` or directly inside `apps/api`.
