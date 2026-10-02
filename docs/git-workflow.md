# Git workflow

`main` is protected: no direct pushes, no exceptions (not even for the repo owner
— see [ADR-0001](adr/0001-public-repository-for-branch-protection.md)). Every
change lands only through a mergeable Pull Request.

## Branches

`<type>/<short-kebab-case-description>`, allowed types:

- `feature/` — new functionality
- `fix/` — bugfix
- `chore/` — maintenance, dependencies, config
- `docs/` — documentation only
- `refactor/` — refactoring with no behavior change

Examples: `feature/page-draft-publish-flow`, `fix/rls-tenant-scoping-media`,
`chore/docker-compose-caddy`.

## What requires explicit sign-off before implementing

At the author's explicit request, these kinds of changes must be discussed
_before_ writing code, not after:

- new dependencies/libraries not already planned
- changes to the content model or database schema
- changes to the Ports & Adapters pattern (new Ports, moving responsibility
  between `domain-core`/`ports`/`application`/adapters)
- security decisions (auth, RLS, session handling)
- any deviation from already-defined phases/decisions

Decisions made are recorded in [docs/adr](adr/) when they involve a real
trade-off, so the reasoning stays legible months later.
