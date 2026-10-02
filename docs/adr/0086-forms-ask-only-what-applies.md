# 0086 — Forms ask only what applies, and tell a team

**Status**: Accepted — 2026-09-26

## Context

Two things a form could not do, both asked for since forms existed
(ADR-0015): show a question only when an earlier answer calls for it ("Other
— please specify"), and email more than one person when an answer arrives.
The field definitions said so outright — "no conditional logic" — and the
notification address was a single column.

## Decision

**One condition per field.** A field may carry
`showWhen: { fieldId, equals }`: it shows while the field it names has that
answer — `equals` is one of a select's options, or `null` for "any answer"
(a ticked box, a non-empty value). One condition, not a rule builder with
and/or: it covers the case people have, and a builder is where forms become
hard to get right for the person making them.

The rule lives once, in `@kometio/shared-types`' `form-conditions.ts`, and
three places read it:

- **the public form**, in the browser, as the visitor answers — imported
  from `@kometio/shared-types/form-conditions`, a subpath with no zod in it,
  so the rule costs the page a few hundred bytes rather than the schemas;
- **the submission**, on the server: a field that was not showing is never
  required and its value is never kept;
- **the editor**, which offers only earlier fields to depend on and names
  what is wrong with a condition next to it.

A condition must name an **earlier** field. That makes one pass in order
enough, chains included: a field depending on a hidden field is hidden too,
because a hidden field counts as unanswered. The API refuses a form whose
conditions break that (`formFieldsSchema`), and the editor will not save one.

A hidden field is **disabled** as well as hidden in the browser: a disabled
control is neither validated nor submitted, so a required field the visitor
cannot see never blocks the form. The server does not rely on it: it keeps
only the answers to fields that were showing — and, while it was at it,
stopped keeping keys that name no field at all, which it used to store
as sent.

**A list of addresses.** `notificationEmail` becomes `notificationEmails`,
up to ten, trimmed and deduplicated by the entity. Each address gets its own
email, so nobody on the list learns who else is on it; one failing address
does not stop the others, and the failure is still reported, as it was with
one. The column changed in two migrations — add and copy, then drop — so
drizzle-kit never had to ask whether the new column was a rename.

## Consequences

- A form that existed before this has no conditions and one address or
  none; it renders and behaves exactly as it did.
- The public site must be rebuilt for conditions to work in the browser; a
  form with a condition served by an older build shows the field hidden and
  never reveals it. There is no older build in production.
