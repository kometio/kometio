# 0027 — React Hook Form for settings dialogs, with a shared reset-on-open hook

**Status**: Accepted — 2026-08-28

## Context

A backlog review flagged "two form philosophies" in `apps/editor-app`
without a declared criterion — investigation found the premise itself
was wrong: `react-hook-form` wasn't a dependency anywhere in the repo,
including in the forms the review called "critical" (`login-form.tsx`,
`forgot-password-form.tsx`) — every form used plain `useState` per
field, uniformly. There was only one philosophy.

The real, confirmed duplication was narrower: five settings dialogs
(`BusinessInfoDialog`, `GeneralSettingsDialog`, `SeoSettingsDialog`,
`LocaleSettingsDialog`, and the colors section of `GlobalStylesDialog`)
each stay mounted for the app's entire lifetime (rendered once from
`SettingsMenu`, toggled by `open`), and each independently reimplemented
the same ~10-line "re-seed local state from the latest fetch, but only
once per open" pattern — comparing a `lastSyncKey` against the current
`open`+data-arrived state during render, per
[react.dev's "you might not need an effect"](https://react.dev/learn/you-might-not-need-an-effect).
`canvas-editor-shell.tsx` has the identical `lastSyncKey` idiom, but for
resyncing an optimistic block-tree copy from a `blocks` prop — unrelated
to form state, and out of scope here.

Asked directly whether to introduce `react-hook-form` now given the
duplication, the user chose to adopt it immediately rather than defer it
to whenever the next settings dialog is added.

## Decision

`react-hook-form` (`^7.86.0`) + `@hookform/resolvers` (`^5.9.1`, for the
one dialog with cross-field validation, below) become the state
management for these five dialogs's forms — `useState`-per-field plus
manual `onChange` handlers goes away in favor of `register`/`Controller`/
`useWatch`.

**Switching libraries didn't remove the duplicated re-seed pattern by
itself** — `useForm`'s `defaultValues` are captured once at mount and
never re-applied automatically when they'd logically need to change
(a well-known React Hook Form behavior, not a bug), so each dialog still
needs to call `reset(newValues)` at the right moment. That "right
moment" — the `lastSyncKey` comparison — is exactly what was duplicated
before, so it's extracted into one hook,
`useResetFormOnOpen(open, source, reset, toValues)`
(`apps/editor-app/src/app/common/use-reset-form-on-open.ts`), with a direct
unit test (`renderHook`, no dialog needed) rather than only indirect
coverage through each dialog's own test.

`LocaleSettingsDialog` uses `zodResolver(localeSettingsSchema)` —
`localeSettingsSchema` (`libs/shared-types`) already existed, including
the `defaultLocale` ⊆ `enabledLocales` cross-field `.refine()` this form
needs, so wiring the resolver reuses validation logic that already lived
in the codebase rather than re-encoding it by hand. The other four
dialogs have no comparable cross-field rule and use plain
`react-hook-form` with no resolver.

`useWatch({ control, name })` is used instead of `form.watch(name)`
wherever a field's live value drives rendered output (e.g.
`GeneralSettingsDialog`'s submit-button disabled state) — `watch()`'s
return value can't be safely memoized, which the React Compiler
(enabled in this codebase) flags by skipping memoization for the whole
component; `useWatch` is React Hook Form's own compiler-friendly
alternative for exactly this.

`canvas-editor-shell.tsx`'s `lastSyncKey` is explicitly left alone — it
resyncs an optimistic block-tree copy from a prop, not form state, and
has nothing to do with a `<form>` or user-entered field values.

## Consequences

- New dependencies: `react-hook-form`, `@hookform/resolvers` (editor-app
  only).
- A genuine test-fixture bug surfaced by the migration, not by the
  library itself: `global-styles-dialog.spec.tsx` and five other specs
  had been passing `themeTokens: null` in their mock `SiteRecord`
  fixtures — the real server never returns `null` there, always at least
  `{ blockStyles: {} }` — caught because `SiteRecord`'s `themeTokens`
  field is non-nullable (see ADR 0026); fixed in the same change.
- No behavior change for users — same fields, same validation outcomes,
  same submit/cancel flow in all five dialogs. Verified via the existing
  `@testing-library/react` suites (real DOM interaction in jsdom, not
  mocked at the component level) plus a live dev-server boot check; no
  manual browser click-through was done (no browser automation tool
  available in the environment this was built in).
- Establishes `react-hook-form` as the default for any _new_ form in
  `apps/editor-app` going forward — not a mandate to retrofit
  `login-form.tsx`/`forgot-password-form.tsx` or any other
  already-working plain-`useState` form that has no duplication problem
  to solve.
