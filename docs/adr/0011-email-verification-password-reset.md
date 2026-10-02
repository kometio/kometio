# 0011 — Email verification, password reset, and the editor-app design system

**Status**: Accepted — 2026-08-17

## Context

Last piece of Phase 3 deferred by ADR-0010: email verification, password
reset with expiring tokens, `EmailPort` + a generic SMTP adapter. Login and
sessions (ADR-0010) already work. This PR also folds in the first real
design-system decision for `apps/editor-app` — confirmed with the user
("iniziamo correttamente a fare le cose") rather than deferring it further,
since the new password-reset UI was the first natural place to apply it.

## Decision

### Token adapter: separate from sessions, sharing a mini-lib

Verification/reset tokens get their own `VerificationTokenPort` +
`verification-token-adapter`, not an extension of `session-auth-adapter`.
Both need the same "generate a random opaque value, store only its hash"
mechanics, so that part moved into a new `libs/opaque-token` mini-lib
(`generateOpaqueToken`/`hashOpaqueToken`) that both adapters now depend on —
the same shape already established for `libs/env-config` (ADR-precedent:
extract a narrow single-purpose lib once duplication is real, i.e. two call
sites, rather than pre-emptively or never). `session-auth-adapter` was
updated to use it too, removing its own private copy of the same logic.

Kept separate from sessions because the two have different lifecycles and
consumption semantics: a session is validated repeatedly and renewed near
its half-life; a verification/reset token is consumed exactly once via an
atomic `DELETE ... RETURNING` (new `verification_tokens` table, RLS-enabled
with the same forced-policy pattern as `sessions`). Folding both into one
adapter would mean one class straddling two different contracts.

`consumeToken` uses the same `bootstrapTenantId` pattern `SessionAuthAdapter`
established in ADR-0010, for the same reason: a token is looked up by its
(globally unique) hash before the caller knows which tenant it belongs to,
and RLS needs a tenant set before it will return any row at all. Same
single-tenant-per-deployment caveat applies.

### Login is not gated on email verification — yet

`loginUser` (ADR-0010) is unchanged: a user can log in whether or not
`emailVerifiedAt` is set. Confirmed with the user as an explicit, tracked
deferral, not an oversight:

> **To do, later**: add a guard that requires `isEmailVerified` before login
> (or before specific sensitive actions) once there's an actual reason a
> Kometio deployment needs it enforced — the seed-only, no-public-registration
> model (ADR-0010) means every account today was already created by
> someone trusted, which is why this isn't blocking now.

### SMTP: Mailpit locally, real credentials mandatory in production

`docker-compose.yml` gained a `mailpit` service (SMTP catcher + web UI on
`:8025`, no auth) — zero real provider needed for local dev, and `EmailPort`

- `smtp-email-adapter` are generic enough that Mailpit is just "a permissive
  SMTP server" from the adapter's point of view, not a special case in code.

> **To do, when deploying to production**: point `SMTP_HOST`/`SMTP_PORT`/
> `SMTP_USER`/`SMTP_PASSWORD` at a real SMTP provider. This is pure
> configuration — the adapter has no dev/prod branching to add.

### Anti-enumeration: request-password-reset always succeeds

`requestPasswordReset` resolves the same way — `{ success: true }`,
`200 OK` — whether or not the email matches an account, and **only sends an
email when it does**. Same principle already applied to login's generic
"Invalid email or password" (ADR-0010): if the response (or timing, or side
effects) differed for "unknown email" vs "known email, reset sent", the
endpoint becomes an account-enumeration oracle — an attacker could feed it
a list of addresses and learn which ones have Kometio accounts, without
guessing a single password. Verified manually (see Consequences): both a
real and a nonexistent email return an identical response, and Mailpit
confirms only the real account's address ever receives mail.

The editor-app's `ForgotPasswordForm` mirrors this: it shows the same "if
the address exists…" confirmation regardless of whether the API call
succeeded, failed, or the account didn't exist — with a `catch` that
deliberately swallows the error (see Consequences for the bug this closed).

### Password reset invalidates all existing sessions

`AuthPort` gained `invalidateAllSessionsForUser(userId, tenantId)`. Resetting
a password is frequently a response to a compromised account — leaving old
sessions alive would defeat the point. `resetPassword` calls it after
saving the new password hash, unconditionally.

### Design system for `apps/editor-app`: Tailwind CSS v4 + shadcn/ui

No file in `apps/editor-app` had its own styling before this PR
(`LoginForm` used inline `style={{}}`). With two new auth screens needed
(forgot-password, reset-password) plus a restyle of `LoginForm`, this was
the first natural point to stop deferring the choice. Confirmed with the
user: **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first config via
`@theme` — no `tailwind.config.js`) + **shadcn/ui** components (Radix-based,
copied into `src/components/ui/` rather than installed as an npm package —
they're ours to edit, not a closed dependency).

Applied to `LoginForm` (restyle) and the two new forms only — not a
retroactive redesign of the Puck editor shell itself, keeping this PR's
scope to what it already had to touch. Accent color (indigo `#4f46e5`) is
shared with the HTML email templates (`libs/application/src/lib/emails/`) —
the first real brand decision for the project, reused identically in both
places rather than inventing two.

One shadcn-generated component needed a deliberate deviation from what the
CLI produces: `CardTitle` renders a plain `<div>` by default. Changed to
`<h2>` (`apps/editor-app/src/components/ui/card.tsx`) — every one of these
new screens is a single `Card` occupying the whole page, so its title is
the page's heading; leaving it a `<div>` means screen-reader users
navigating by heading structure never find it. This is a real accessibility
gap in shadcn's default output, not a project-specific choice, and worth
fixing here since the component was only just generated for this PR.

## Consequences

- New libs: `libs/opaque-token`, `libs/adapters/verification-token-adapter`,
  `libs/adapters/smtp-email-adapter`. New routes: `POST /auth/verify-email`,
  `POST /auth/verify-email/resend` (authenticated), `POST
/auth/request-password-reset` (rate-limited), `POST /auth/reset-password`.
- New env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_ADDRESS`, `SMTP_USER`,
  `SMTP_PASSWORD` (see `.env.example`).
- **Manual verification surfaced a real gap, fixed in this PR rather than
  deferred further**: the verification email's link
  (`{EDITOR_APP_URL}?verifyToken=...`) had nowhere to land — the original
  plan for this PR scoped email verification as "backend endpoint only, no
  editor-app page," but that leaves the CTA button in a real email pointing
  at a dead end for a real user. Added a minimal `VerifyEmailView`
  (`apps/editor-app/src/app/auth/verify-email-view.tsx`), same shape as
  `ResetPasswordForm` but auto-submitting on mount since there's no user
  input to collect — `app.tsx` now checks `?verifyToken=` the same way it
  already checked `?resetToken=`.
- **Manual verification also caught a real bug**: `ForgotPasswordForm`'s
  original `try { await requestPasswordReset(email); } finally { ... }` had
  no `catch` — the anti-enumeration UX (always show the same confirmation)
  worked because of the `finally`, but the promise rejection itself was
  left unhandled, which would have spammed the browser console on every
  network hiccup in production. Fixed by adding an explicit `catch` that
  swallows the error on purpose.
- Verified end-to-end via `curl` + Mailpit's HTTP API against a live
  `docker compose` stack (Postgres + Mailpit) and the real API/editor-app
  dev servers: email verification (consume → single-use → DB reflects
  `email_verified_at`), password-reset request for both a real and an
  unknown email (identical `{success:true}` response, only the real
  account's address receives mail), full reset cycle (old session 401s
  immediately after reset, old password rejected, new password works,
  reset token itself single-use). Browser/Playwright verification of the
  new UI screens themselves was not performed this session — no browser
  automation tool was available — so the editor-app changes are covered by
  their Vitest suite (44 tests, 98%+ statement coverage) and a successful
  production build, but not by an interactive click-through.
- Every project touched still clears its ADR-0009 coverage threshold —
  `libs/application` and the new adapters at 100%, `apps/editor-app` at
  97%+ (60% floor), verified via the same sequential
  `nx run-many -t test --coverage --parallel=1`.
