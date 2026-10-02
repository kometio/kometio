# env-config

A single function, `requireEnv(name)`, that reads a required environment
variable and throws immediately with an actionable message if it's missing
or empty — the shared "fail loudly, never guess" pattern this library
consolidates for every credential/config value read from `process.env`
across `apps/api`, `apps/editor-app`, and `apps/public-site`.

## Why this exists

Before this lib, that check was hand-rolled per call site (see the comment
in `require-env.ts` pointing at `libs/adapters/postgres-db/src/lib/client.ts`
for the original instance). The risk it guards against: a missing secret
(a DB password, a signing key, an API token) silently falling back to
`undefined` or a hardcoded default and only failing much later — or worse,
succeeding in a dangerously wrong way — instead of crashing at boot with a
clear message pointing at `.env.example` and `docs/development.md`.

`requireEnv` treats an empty string the same as `undefined` — a variable
present in the environment but set to `""` is still "missing" for this
purpose, since a real secret is never legitimately empty.

## Used by

Imported across all three apps wherever a required config value is read:
`apps/api` (its `main.ts` bootstrap and several feature modules/factories:
auth, media, newsletter, pages, maintenance, public-pages, public-forms,
public-newsletter, site-layout-sections), `apps/editor-app` (via its own
`require-vite-env.ts` wrapper for Vite's `import.meta.env`), and
`apps/public-site` (`public-api-client.ts`, `editor-app-url.ts`).

## Running unit tests

Run `nx test env-config` to execute the unit tests via [Vitest](https://vitest.dev/).
