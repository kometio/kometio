# 0077 — Node 24, and pnpm installed without corepack

**Status**: Accepted — 2026-09-24

## Context

Everything ran on Node 22: CI's four jobs, the three images, the
development machine. Two separate pushes moved it.

The first was a Dependabot proposal to take the images to `node:25-alpine`.
It failed on all three, at the same line: `corepack enable` → exit 127.
Corepack is not in the Node 25 images at all — it was deprecated in 24 and
dropped — and corepack is how these Dockerfiles installed pnpm. A base
image bump therefore broke the build in a way no lockfile check would have
caught.

The second is that dependencies are going ESM-only. `@nestjs/schedule` 12
is a native ES module, which stopped the API's test that loads the whole
module graph from running at all. That one is not the last.

## Decision

### Node 24, not 25

24 is the line with long-term support; 25 is odd-numbered and short-lived.
CI, the three images, `.nvmrc` and `engines.node` all name it, so a machine
that drifts says so instead of being found out later.

### pnpm is installed explicitly, from the version package.json already pins

`npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"`,
after copying `package.json` alone — one source of truth, and a layer that
does not rebuild when a source file changes. The API's runtime stage keeps
a hand-written pin, because the pruned `package.json` it ships with has no
`packageManager` field; the comment there says so.

This is not only about Node 25. Corepack asks to be enabled, downloads a
package manager at build time, and was deprecated exactly because that is
not what an image build should depend on.

### A Node or Postgres major is not something Dependabot may propose

Both are migrations that reach past the file being edited:

- a Node major has to move with `ci.yml`, which Dependabot cannot see, and
  it removed corepack from under the build;
- a Postgres major does not upgrade a database, it stops reading it — a
  data directory written by 16 is not one 18 can open, so an installation
  that pulled such a bump would find its database refusing to start.

`.github/dependabot.yml` ignores majors for both, with the reason beside
each. Minors and patches still arrive.

### Jest is told to transform the ESM dependency

Node 24 can `require` an ES module; Jest's own module registry still
cannot, so the runtime being capable was not enough — measured, not
assumed: the suite fails the same way on 22 and on 24, and passes on both
once the package is transformed. `@nestjs/schedule` joins the
`transformIgnorePatterns` allow-list that `sanitize-html`'s ESM-only
dependencies were already on.

## Consequences

- `@nestjs/schedule` 12 is in, which is what the last dependency batch had
  to hold back.
- The next ESM-only dependency has a place to be added, and the comment
  next to it says why the list exists.
- A contributor on Node 22 now gets told by `engines` rather than by a
  failure three steps later. `.nvmrc` makes `nvm use` enough.
- The images build without downloading a package manager, so nothing in
  the build depends on corepack's future.
- Postgres 18 remains to be done deliberately, with a dump-and-restore
  procedure that is written down and tested, and the CI service moved in
  step.
