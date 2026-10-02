# 0005 — CI Postgres credentials generated in-job, not from repo secrets

**Status**: Accepted — 2026-08-17

## Context

CI needs a throwaway Postgres to run the integration test suite (see ADR-0004).
The first attempt stored two GitHub Actions repository secrets
(`CI_POSTGRES_PASSWORD`, `CI_POSTGRES_APP_PASSWORD`) and referenced them in the
workflow's `services.postgres.env` and job-level `env` blocks, specifically to
avoid ever writing a literal password value in a checked-in file.

That broke CI for every Dependabot pull request: GitHub does not expose
repository secrets to workflow runs triggered by Dependabot (`pull_request`
event from `dependabot[bot]`), by design — it stops a malicious dependency
bump from exfiltrating secrets through a modified CI workflow. The secret
reference silently resolved to an empty string, and the official `postgres`
image refuses to start with an empty `POSTGRES_PASSWORD`
("Database is uninitialized and superuser password is not specified"),
so every Dependabot PR's CI failed at container startup.

Two ways to actually fix it: switch the workflow trigger to
`pull_request_target` (which does get secrets even for Dependabot/fork PRs,
because it runs in the base repo's context) — rejected, because running a PR's
own code under `pull_request_target` with real permissions/secrets is a
well-known class of GitHub Actions vulnerability ("pwn request") unless
handled very carefully, and using it here would trade one CI credential
problem for a real supply-chain risk. Or: stop needing a repository secret at
all for a credential that only has to survive the length of a single job.

## Decision

The CI Postgres container is no longer a `services:` block (which requires its
env to be known at job-setup time, before any step has run). It's started with
a plain `docker run` step instead, after generating both passwords in-job with
`openssl rand -hex 24`, masked from logs with `::add-mask::`, and exported via
`GITHUB_ENV`. No `secrets.*` reference anywhere, so the workflow behaves
identically regardless of what triggered it — human push, human PR, or
Dependabot.

## Consequences

- Dependabot PRs build and test correctly again.
- One fewer thing to provision/rotate: the two repo secrets were deleted, CI
  needs zero stored credentials for this.
- Every CI run gets a fresh random password, never reused across runs — a
  marginal improvement over a static secret, though not the primary reason for
  the change.
- Losing the `services:` block also loses GitHub's built-in health-check wait;
  replaced with the same manual `pg_isready` polling loop already used in
  local dev (`docs/development.md`), so the two now match more closely than
  before.
