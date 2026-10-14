# 0138 — The checks that guard `main` always report

**Status**: Accepted — 2026-10-14. Closes OPS-6 of the review of 2026-10-11.

## Context

`main` is protected by a ruleset that requires six checks: `audit`, `lint`,
`typecheck`, `build`, `test` and CodeQL's `analyze`. Two checks that catch the
most expensive mistakes were not among them, for two different reasons.

- **`e2e`** runs on every pull request and could be required today. It simply
  was not.
- **`single-image-check`** (the three apps built, the single image assembled,
  `docker/kometio/check.sh` and the browser suite run against it) lived in a
  workflow whose trigger had a `paths:` filter. A pull request that touches
  none of those paths does not start the workflow, so the job never reports,
  and a required check that never reports leaves the pull request pending for
  ever. That is why the ruleset's history says "not the Docker build".

And `docker-compose.prod.yml`, the file a person runs on a server, was never
read by anything: a variable renamed in the file and not in `.env.prod.example`
was found by whoever ran `docker compose up`.

## Decision

- **The filter moves from the trigger to a job.** `docker-build.yml` starts on
  every pull request, and its first job, `changes`, says whether anything an
  image is made of changed, by the same list the trigger had. `build` — and,
  through `needs`, `single-image-check` — are skipped when it did not. A
  skipped job is a pass to a required check, and says "nothing to build here".
  On a push there is no question and everything runs, as before.
- **`docker compose -f docker-compose.prod.yml config`** runs in the CI
  workflow on every pull request (`compose-config`), with throwaway values for
  what the file requires. It interpolates the file the way `up` does and fails
  on a variable that is required and not given. It starts nothing.
- **What is required is the ruleset's, and it is not changed from here.**
  `e2e` and `single-image-check` can now be added to it (the names are the job
  names), as can `compose-config`.

## What this does not do

- **It does not make a pull request slower where it was not.** A change that
  touches an image's sources ran this job before and runs it now; one that does
  not still skips it, in a few seconds of the `changes` job instead of not
  starting.
- **It does not run the compose stack.** `config` checks the file's own
  consistency; that the stack comes up is what `single-image-check` already
  shows of the single image, and what a person sees on a server.
- **A required `single-image-check` is minutes on every code pull request**
  (about twelve). That is the price of requiring it, and the reason it is the
  ruleset's decision and not this change's.

## Consequences

- `docker-build.yml` has a fourth job in front of the others; its list of
  paths is in one place, in the script.
- The first pull request that changes only documentation shows `build` and
  `single-image-check` as skipped: that is the path this change added, and it
  is the one a pull request that touches `docker-build.yml` (this one) cannot
  exercise.
