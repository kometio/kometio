# 0093 — Who may do what is one table

**Status**: Accepted — 2026-09-29

## Context

Kometio has three roles: admin, publisher and editor. Until now a handful
of routes checked a role: publishing a page, two of the site's settings,
users, themes and AI. Each listed its roles by hand with `@Roles(...)`.
Every other mutating route checked nothing past the session. An editor
could publish a section or the header and footer, delete pages, media and
forms, move pages, change a page's address and SEO, and change most of the
site's settings. The editor role exists so that somebody can write without
putting anything online.

The editor had its own copy of the rule, an `isAdmin` flag, which covered
only the sidebar's Users entry. Everywhere else it showed every button to
everybody and let the API answer with a generic error.

## Decision

- **One table, four permissions.** `PERMISSIONS` in `@kometio/shared-types`
  maps `editDrafts`, `changeLiveSite`, `delete` and `configureSite` to the
  roles that have them. The API and the editor both read it, so they
  cannot drift apart. The full matrix is in [docs/roles.md](../roles.md).
- **Strict about what is live.** Anything a visitor sees without a
  publish needs `changeLiveSite`, even when it looks small: a page's SEO,
  address, parent, order, collection and terms; a header's stickiness; a
  section's exposed fields; forms, which have no draft; collections,
  taxonomies and terms. An editor's work reaches visitors only through a
  publisher.
- **Routes name a permission, not roles.** `@Allowed(permission)` on a
  method, or `@RequiresPermission(permission)` beside class-level guards.
  Nothing lists roles by hand any more.
- **A missing session is 401.** `RolesGuard` answers 401 when no session
  was read, where it used to fail with a 500.
- **The editor leaves out what the role cannot do.** It does not show
  such controls disabled. `useCurrentSession().can()` replaces `isAdmin`.
  Where a missing button would confuse, one muted line says who does it.
  Screens that are one role's whole job are guarded on the route.
- **One test covers the matrix.** An integration spec sends each guarded
  route as each role.

## Consequences

- An editor can no longer turn a selection into a shared section from the
  canvas. That action publishes the new section at once, because the
  instance on the page shows the published content. Publishers and admins
  keep it.
- An editor sees forms but cannot save them, and does not see
  Classification at all.
- A new mutating route has to choose a permission. Without one, it is open
  to every signed-in user, and the integration spec is where that shows.
