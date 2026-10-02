# 0095 — An index read may be absent: `noUncheckedIndexedAccess` is on for production code

**Status**: Accepted — 2026-09-30

## Context

`strict` was on everywhere and `noUncheckedIndexedAccess` was off, so
`items[0]`, `record[key]` and `match[1]` were typed as if the element were
always there. The code compensated with assertions in comments ("a group
always has a translation", "the pattern's group always takes part"), and
with a few `as` casts, none of which the compiler could check.

Turning the flag on for a measurement gave about 130 errors in production
code and some 480 in specs. One of them was not a
typing problem. `sectionOverridesFromProps` kept a Section block's
instance values in a plain object keyed by a block id read from stored
props; the key pattern accepts `__proto__`, and a prop named
`ovr:__proto__:foo` wrote `foo` onto `Object.prototype` for the whole
render process. The read of that dictionary is what the flag flagged.

## Decision

- **`noUncheckedIndexedAccess` is on in `tsconfig.base.json`**, so it holds
  for every library, adapter and app that extends it, and in the Astro
  projects (`apps/public-site`, each theme's `tsconfig.astro.json`), which
  do not extend the base and set it themselves.
- **It is off in every `tsconfig.spec.json` and in `apps/e2e`.** A spec
  that indexes something that is not there fails at that line; `expect(list[0]?.name)`
  and a guard before it say the same thing with more noise. The public
  site is the exception: `astro check` reads one tsconfig for source and
  specs alike, so its specs are written to the flag.
- **What replaces the assumption is a check the reader can see**, never a
  `!` or an `as`: destructuring the first element and returning on
  `undefined`; a guard that narrows the value once; `?.` and `??` where
  "absent" has an obvious meaning; a function of its own where several
  callers took `[0]` of a one-element list (`resolvePageContent`,
  `resolveSectionInstancesIn`, `answeredRow`).
- **A collection keyed by something a stored value or a visitor chose is a
  `Map`**, not an object: the key may be `__proto__` or `constructor`.
- Where the invariant is real and the server is what would break it (a page
  group with no translation, a `COUNT` that answers no row), the code
  throws an error that says so instead of a `TypeError` on a field read.

## Consequences

- A new library from the generator gets the flag in its production
  tsconfig and, unless its `tsconfig.spec.json` opts out, in its specs. The
  spec typecheck then fails with the same "possibly undefined" error, and
  the fix is one line in that file.
- A `Record<string, T>` read is `T | undefined` now, so a lookup table
  whose keys are known should be typed by its keys (`Record<StyleBreakpoint, T>`)
  rather than by `string`.
- The `typecheck` target is not part of the `git push` hook (CI runs it),
  so a type error can stay on a branch until CI. Running
  `nx run-many -t typecheck` before opening a PR is what catches it.
