# 0001 — Public repository to enable branch protection

**Status**: Accepted — 2026-08-17

## Context

The project's non-negotiable workflow requires `main` to be protected from the
first commit: no direct pushes, every change only via Pull Request. The initial
plan called for a private GitHub repository.

When creating the protection ruleset on `main`, the GitHub API responded with
`403 Upgrade to GitHub Pro or make this repository public to enable this feature`:
private repositories on free personal accounts don't support branch protection
(classic or ruleset).

## Decision

The `kometio/kometio` repository is public. The plan/business document
(`piano-progetto-astro-cms.md`, market analysis, licensing, positioning) stays
local and gitignored — it never ends up in the public repository. Only the code
becomes public.

## Consequences

- Branch protection is active for free, consistent with the non-negotiable
  workflow.
- The code is visible to anyone even before the first public release — acceptable
  because the FSL license already anticipates an eventual publication, and
  "self-hosted open source" is one of the product's pillars.
- If it's ever necessary to go private again (e.g. before the FSL license is
  formalized), a GitHub Pro upgrade will be needed to keep branch protection.
