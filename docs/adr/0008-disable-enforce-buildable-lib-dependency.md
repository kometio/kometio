# 0008 — Disable `enforceBuildableLibDependency`

**Status**: Accepted — 2026-08-17

## Context

Wiring `apps/editor-app` to `libs/puck-config` tripped
`@nx/enforce-module-boundaries`'s `enforceBuildableLibDependency` check:
"Buildable libraries cannot import or export from non-buildable libraries."
`apps/api` imports several of the same kind of library (`domain-core`,
`shared-types`, ...) and never triggered it.

The difference isn't the libraries — every library in this workspace is
generated with `--bundler=none` on purpose (source consumed directly by
whichever app's own bundler builds it, not pre-built and published). The
difference is the _app_: `editor-app` uses Vite via the `@nx/vite` plugin,
which Nx recognizes as a proper "buildable" target for this rule's purposes;
`api`'s build is a hand-rolled `nx:run-commands` webpack invocation, which
Nx's tooling can't introspect, so the rule silently never applied to it. Same
architecture, inconsistent enforcement depending on which app happens to ask.

The rule itself protects a scenario that doesn't apply here: it exists to
stop a _published, pre-built_ library from losing access to a non-buildable
dependency's source once it's shipped standalone. Nothing in this workspace
is published as a standalone package — every "buildable" app already bundles
its own dependency tree at build time.

## Decision

`enforceBuildableLibDependency: false` in the root `eslint.config.mjs`. Kept
the rest of `@nx/enforce-module-boundaries` (tag-based dependency
constraints) active.

## Consequences

- Consistent enforcement (or non-enforcement) regardless of which bundler an
  app happens to use, instead of a rule that silently skipped `apps/api` by
  accident.
- If a library ever does need to be published/consumed standalone outside
  this monorepo, this default should be revisited for that specific library
  rather than reactivated workspace-wide.
