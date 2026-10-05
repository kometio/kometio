# Kometio

[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A580%25%20domain%2Fapp%20%C2%B7%20%E2%89%A560%25%20infra-brightgreen.svg)](https://github.com/kometio/kometio/actions/workflows/ci.yml)

Kometio is a self-hosted visual CMS for brochure/showcase websites:
restaurants, professionals, small businesses, agencies building a
client site — content that's mostly pages and blocks, not a full
application. It's built for a developer or agency to deploy per client
(Docker image, own Postgres database), not a hosted SaaS: each deployment is
a single tenant/site today, with the underlying multi-tenancy plumbing
already in place for later (see [Architecture](#architecture-at-a-glance)
below).

## What you actually get

- **A visual, block-based page editor.** `apps/editor-app` is a React admin
  SPA where a non-technical editor builds pages by dragging, arranging and
  editing around a hundred block types directly on a live preview of the
  real page — Hero, Gallery, Form, Testimonials, Countdown, Pricing Table,
  Accordion, Tabs, Timeline, Nav/Header/Footer sections, and more (full
  list in `libs/block-registry/src/lib/blocks/`). Simple text fields (titles,
  labels, body copy) are editable in place with a double-click directly on
  the canvas, not only through a sidebar form — see
  [ADR-0028](docs/adr/0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md).
  Every save keeps the editable draft separate from the snapshot the
  public site serves, with full version history and rollback — a new
  version row per save, never a destructive overwrite. Publishing is per
  language: one can go live today and another when it is ready.
- **A real, from-scratch canvas editor — no third-party page-builder
  library.** The editor doesn't embed a drag-and-drop library; it renders
  the actual page in an iframe (the same Astro output `apps/public-site`
  serves) and drives selection, drag-reorder, insert/remove and inline text
  editing through a small typed `postMessage` protocol between the parent
  app and that iframe (see [docs/architecture.md](docs/architecture.md) and
  [ADR-0028](docs/adr/0028-canvas-inline-text-editing-via-tiptap-in-preview-iframe.md)).
- **Multi-language sites.** Locale-prefixed URLs (`/it/chi-siamo`,
  `/en/about-us`), page translations grouped together, a configurable
  fallback for a locale/slug combination with no published translation, and
  an in-editor language switcher — see
  [ADR-0017](docs/adr/0017-multilingua-locale-prefixed-urls-and-page-translations.md).
- **Theming, at two levels.** A site-level style panel (colors, font,
  custom CSS/scripts, favicon) editable live with no rebuild, layered under
  filesystem theme packages (`themes/<name>/`) that an agency can write from
  scratch to give a client site its own distinct look, picked per site and
  live from the editor. A theme is just a directory — it can live outside
  this repository, needs no packaging, and can be as small as two files.
  See [docs/creating-a-theme.md](docs/creating-a-theme.md) to build one,
  [ADR-0021](docs/adr/0021-site-theming-filesystem-packages-and-style-settings.md)
  and [ADR-0043](docs/adr/0043-theme-regions-and-the-publishable-theme-surface.md)
  for the design, and
  [ADR-0022](docs/adr/0022-component-and-instance-style-overrides.md)
  for component/instance-level style overrides on top of a theme's tokens.
- **A real form builder**, not a single hardcoded contact block: forms are
  created and edited as their own entity with arbitrary field definitions, a
  form-picker block embeds any form on any page, and submissions land in
  their own table. Anti-spam (honeypot + a captcha: Cloudflare Turnstile with
  your keys, or one built into Kometio that needs no account), optional
  newsletter opt-in (Mailchimp/Brevo), file-upload fields, and multi-step
  forms are built on top of the same base — see
  [ADR-0015](docs/adr/0015-form-builder-architecture.md) and
  [ADR-0020](docs/adr/0020-form-builder-anti-spam-newsletter-attachments-multistep.md).
- **Session-based auth**, no public self-registration — every user arrives
  via an admin-only invite. See
  [ADR-0010](docs/adr/0010-session-based-auth-foundations.md).

## Architecture at a glance

Three apps, one shared backend:

- **`apps/api`** — NestJS backend, the only thing that talks to Postgres.
  Ports & Adapters (hexagonal): `libs/domain-core` (pure entities) ←
  `libs/ports` (interfaces) ← `libs/application` (use cases) ←
  `libs/adapters/*` (concrete implementations — Postgres repositories,
  local-disk/S3 media storage, session auth, SMTP email, Turnstile,
  newsletter providers, ...), wired together in `apps/api`.
- **`apps/editor-app`** — the authenticated admin/editor SPA (React,
  TanStack Router). Where content is created and managed.
- **`apps/public-site`** — the actual public website, Astro (`output:
'server'`), rendered per-request from a dedicated unauthenticated API
  endpoint that only ever serves published content — never a direct
  Postgres read, and never the authenticated CRUD API `apps/editor-app`
  uses. See [ADR-0012](docs/adr/0012-public-site-rendering-via-dedicated-api-endpoint.md).

Postgres with Row Level Security enforces tenant isolation at the database
level (`tenant_id = current_tenant()` on every per-tenant table, enforced
even in today's single-tenant-per-deployment mode) — see
[docs/architecture.md](docs/architecture.md) for the full dependency graph,
the content model, and the RLS mechanics, and
[ADR-0002](docs/adr/0002-non-superuser-role-for-rls-enforcement.md) for why
this only actually protects anything when the app connects as a
non-superuser role.

Nx monorepo, pnpm package manager.

## Quickstart

```sh
cp .env.example .env
docker compose up -d postgres mailpit
pnpm install
pnpm --filter @kometio/postgres-db run db:migrate
pnpm --filter @kometio/postgres-db run db:seed
pnpm exec nx run-many -t build typecheck test lint
```

This gets you a running database (seeded with a fixed dev tenant/site and a
dev admin user) and a green build — see
[docs/development.md](docs/development.md) for how to actually run
`apps/api`, `apps/editor-app` and `apps/public-site` together and see a page
built and published end to end.

## Documentation

- [docs/architecture.md](docs/architecture.md) — Ports & Adapters, monorepo
  structure, multi-tenant/RLS, content model
- [docs/development.md](docs/development.md) — local setup, commands, DB
  connection
- [docs/self-hosting.md](docs/self-hosting.md) — running Kometio in
  production, on your own server
- [docs/creating-a-theme.md](docs/creating-a-theme.md) — turning a design
  into a Kometio theme; [themes/README.md](themes/README.md) is its reference
- [docs/git-workflow.md](docs/git-workflow.md) — branches, PRs, what requires
  sign-off before implementing
- [docs/adr/](docs/adr/) — Architecture Decision Records
