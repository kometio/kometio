# 0040 — Legal document generator: deterministic templates, always drafts, pre-filled from data Kometio already has

**Status**: Accepted — 2026-09-01

## Context

The cookie banner (ADR-0039) gates tracker scripts, but a GDPR-compliant
site also needs a Privacy Policy and Cookie Policy to point the banner's
own links at, plus (commercially, not a GDPR requirement) Terms &
Conditions. iubenda — the market leader researched for this feature — asks
a generic questionnaire and generates text an admin then has to review.
Kometio's advantage over that questionnaire is structural: it already holds
most of the answers as real, structured data — `BusinessInfo`,
`enabledLocales`, `formSubmissionRetentionDays`, and (as of ADR-0039) the
categorized tracker script list — so the wizard pre-fills instead of
asking blind, and the admin only edits what's actually missing (contact
email, VAT number, jurisdiction).

## Decision

### Deterministic template functions, no LLM at generation time

Each document (`privacy-policy` | `cookie-policy` | `terms-conditions`) is
a plain parameterized string-building function per locale (it/en in v1,
`libs/application/src/lib/legal-documents/*.template.ts`), not an LLM
call. Legal text needs to be reproducible, diffable in code review, and
identical across installations given the same answers — exactly the
properties an LLM call would remove. `LegalDocumentAnswers`
(`legal-document-input.ts`) is the single input shape every template
consumes; the wizard exists to fill it in with minimal typing.

### Always a draft, never auto-published

`generateLegalDocuments` (`generate-legal-documents.use-case.ts`) creates
a `PageGroup` + one `PageTranslation` per requested locale, exactly like
any other page — draft by construction (`PageTranslation.create` never
sets a published state), with the same first-ever section explicit: a
`Callout` block (tone `warning`) reading "auto-generated draft — have a
lawyer review before publishing," a regular, deletable block, not a system
flag. The API layer (`apps/api/src/app/legal-documents/`) reflects this in
its authorization: `SessionAuthGuard` only, no `@Roles('admin')` gate,
because — unlike `themeHeadScript`/`themeTrackerScripts` — this endpoint
never injects raw script or touches anything live; the worst case is an
unpublished page draft.

### i18n: shared content + `fieldValues` overlay, not diverged content

Per ADR-0034's own two options, this picks shared structure over diverged
content specifically to keep version history on a legal document — the
one page type where "what did this policy actually say on date X" matters
most. This is only sound because every locale's template output has the
identical section/paragraph shape by construction (same number of
`Heading`/`Text` block pairs per locale, per document kind) — verified by
`legal-document-templates.spec.ts`'s own symmetry test, not assumed.
`build-legal-page-content.ts` generates the block tree's stable ids once,
from the site's default-locale outline, and every other requested
locale's text is attached as a `fieldValues` overlay
(`built.fieldValuesFor(...)`) against those same ids — never a second,
independent block tree.

### New `Heading` block

None of the 48 existing blocks is a semantic section title (`Hero`/
`Feature` are visual, not structural) — a real gap for any accessible,
SEO-correct long-form legal page, and reusable well beyond this feature.
Added to `libs/block-registry` + `Heading.astro`, `h2`/`h3`, translatable
text.

### Slug resolution reused, not reimplemented

`findAvailableSlug` was extracted out of `duplicate-page-group.use-case.ts`
(its `-copy`/`-copy-N` loop) into its own file, parameterized by a
candidate-slug builder, so this use-case's own `baseSlug`/`baseSlug-2`/...
resolution reuses the same sibling-lookup loop instead of re-implementing
it — the only other multi-repository-save orchestration in the codebase,
same non-transactional trade-off already accepted there (no
unit-of-work port exists; a partial failure midway leaves whatever was
already created as real, harmless drafts).

### Wizard: a `react-hook-form` multi-step flow, not a dialog

ADR-0027 introduced `react-hook-form` for single-shot settings dialogs;
this is the first multi-step use of it (`legal-documents-wizard.tsx`) —
one `useForm` instance holds every step's answers, `trigger()` gates each
"Avanti" against just that step's fields. Reached from the Cookie banner
page (`_shell.cookies.index.tsx`), not a top-level nav entry — it's a
one-off generation flow, not a setting revisited often. The review step
calls `POST .../legal-documents/preview` (no persistence) so the admin
reads the actual generated text before committing to draft creation.

## Consequences

- Closes the other half of the GDPR gap ADR-0039 opened: the banner now
  has real pages to link to, generated from data the admin already
  entered elsewhere in Kometio rather than a blind second questionnaire.
- Deliberately out of scope, same as ADR-0039: no LLM-assisted rewriting
  of the generated text (a template-only v1, by design, not a missing
  feature); no automatic re-generation when `BusinessInfo`/tracker list
  changes later — the generated pages are a snapshot, editable like any
  other page from that point on.
