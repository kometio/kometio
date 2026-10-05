# 0101 — Kometio is also one image

**Status**: Accepted — 2026-10-03

## Context

Running Kometio meant the compose stack of [ADR-0042](0042-self-hosting-distribution-and-runtime-theme-selection.md):
Postgres, a migration step, the API, the public site, the editor and a reverse
proxy — a clone of the repository, an `.env` with a dozen secrets to make, and
a server with three DNS names. That is the right shape for a production
deployment and the wrong one for the first ten minutes. The developers and
agencies who decide whether Kometio gets tried leave when an installation takes
longer than a coffee; the aim is a working site on a laptop in about two
minutes, and later one object to put on a server.

## Decision

- **`ghcr.io/kometio/kometio` holds all of it**: Postgres 16, the API, the
  public site and the editor's web server, started by `docker/kometio/launcher.mjs`
  in that order (the migrations between the database and the API), with
  everything that has to survive in **one volume**, `/data` — the database, the
  uploaded files and the keys the launcher generated.
- **It assembles, it does not rebuild.** The image takes the finished
  artefacts out of the three apps' own images (`COPY --from`; three build
  arguments name them), so there is still exactly one place that says how each
  app is built. The editor's `config.js` and its policy header come from the
  editor image's own script ([ADR-0076](0076-the-editor-reads-its-addresses-at-start-up.md)).
- **If one process dies, all of them stop and the container exits 1**, so that
  Docker's restart policy brings the whole thing back clean rather than leaving
  half of it running. `docker stop` stops them in reverse, Postgres with a fast
  shutdown, and exits 0 in about a second.
- **It is a trial unless told otherwise.** It runs as `NODE_ENV=development`,
  with Cloudflare's published test captcha secret and SMTP pointed at a closed
  port, and anything the person sets (`SMTP_*`, `TURNSTILE_*`, `NODE_ENV`, the
  three addresses) wins over those defaults. The API refuses the test captcha
  keys in production, which is the point: a trial must not quietly behave like
  a deployment, and the README says what it does not do.
- **The first-run token is shown where a person looks.** The API prints it in
  its log and keeps it in memory; the launcher picks it up and prints it again
  in its "ready" banner.
- **CI builds, tests and publishes it** (`.github/workflows/docker-build.yml`).
  On a pull request the three images are rebuilt from the cache the other jobs
  just wrote, the single image is assembled from them, and
  `docker/kometio/check.sh` starts it, checks it, completes the setup wizard,
  restarts it, runs the whole end-to-end suite against it, and stops it. After
  a push to `main` or a version tag it is assembled from **that commit's own**
  images (`sha-…`, never `main`, which a later push may already have moved), one
  architecture per native runner, pushed by digest and smoke-tested from the
  registry; the tags are put on only when both architectures pass.
- **The suite runs against the image through its own Playwright config**
  (`apps/e2e/playwright.image.config.ts`), which has no `webServer`: a server
  that is down fails the run, instead of Playwright starting a second API from a
  build against whatever database the root `.env` names.
- **The first run is walked in a real browser, on an installation of its own**
  (amended 2026-10-05; `apps/e2e/src/first-run/`, run by `check.sh` before the
  rest). The suite proper runs on an installation somebody has already set up,
  with the captcha key and the mail server the suite gives it, and that hides
  what a person meets first. The image is started a second time the way the
  quickstart says, with neither, and the test does what a person does: it
  arrives with a login cookie left by another installation, finds the setup form
  with the domain already filled in, creates the account, finds the site
  answering at once, and signs in again through the form in a clean browser. It
  spends the installation (the setup token is single-use), so it runs once and
  never retries. It was shown to fail on each of the two defects it is there
  for, reintroduced one at a time: the left-over cookie (the form never
  appears), and an empty captcha key (the login button stays disabled).

## Consequences

- One command starts Kometio and one volume holds a site. A copy of the volume
  taken while the container is stopped, put into a new volume, starts with the
  same account and site (tried; the README has the commands). There is no
  export or import of a single site yet.
- A database inside the container suits a trial and a small site that is backed
  up. For anything that cannot be lost, the compose stack keeps Postgres in a
  container of its own. The launcher has a path for an external database
  (`POSTGRES_HOST`); it has not been exercised, and the README does not offer it.
- Not in this image yet: HTTPS and a domain of its own, captcha and email as
  options with a warning instead of defaults, one address (`/admin`, `/api`) in
  place of three ports, and uploading a theme from the editor, which needs a
  builder that is not part of it.
- A pull request that touches `apps/`, `libs/`, `docker/` or the lockfile now
  also builds and tests the image: some ten minutes more CI. It is not a
  required check yet; it proves itself stable first, as the `e2e` job did.
- The package `ghcr.io/kometio/kometio` is created private; it is made public
  once, after the first publish, like the other images.
- On an installation that has no account yet, the public site's pages answer
  500 (the API has no tenant to give them) while its health check answers 200.
  The check found it; it is not changed here.
- The editor used to wait on a 503 from a deployment that had not been set up
  when the browser carried a session cookie left by another installation on the
  same host (cookies do not tell ports apart). `SessionAuthGuard` now answers
  that cookie as "no session", so the editor goes to the setup form.
