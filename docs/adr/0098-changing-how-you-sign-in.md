# 0098 — Changing how you sign in: the password and the email

**Status**: Accepted — 2026-09-30

## Context

A person could not change their password except through "forgot my
password", and could not change their email at all. Both are how they sign
in, and both are what an attacker with a borrowed session would want.

## Decision

- **Both ask for the current password again**, in the request that changes
  them (`POST /account/password`, `POST /account/email-change`). A session
  left open on a shared computer, or a stolen cookie, is not enough to take
  the account over.
- **A wrong current password is a 403, not a 401.** The session is valid and
  stays valid; a 401 tells a client to sign in again, which is the one thing
  it must not do. Guessing is limited to five tries per person in fifteen
  minutes (`PerUserThrottlerGuard`), counted on the person and not the
  address, because the holder of a stolen session can come from anywhere.
- **A password change ends every other session and keeps the one it was
  made from.** People change a password when they suspect somebody has it;
  that somebody must be signed out. `AuthPort.invalidateOtherSessionsForUser`
  is one `DELETE ... WHERE token_hash <> $keep`, so there is no moment with
  no session at all.
- **An email change is two steps, and the link goes to the NEW address.**
  `POST /account/email-change` mails a link there and changes nothing;
  `POST /auth/confirm-email-change` (no session: the link is opened from a
  mailbox, often on another device) makes the change. Without the link, one
  typo would send every reset to a stranger.
- **The new address travels in the token, not on the user.** A
  `verification_tokens.payload` column holds it, and the token can confirm
  that address and no other. Kept on the user (`pending_email`), asking for a
  second address would turn the first link — sent to a mailbox that proved
  nothing about the second — into a way to take the second.
- **The address is checked twice**: when it is asked for (409 if somebody
  has it) and when it is confirmed, because it may have been taken in the
  day between; the unique constraint decides a tie. A refused link is spent
  and has to be asked for again.
- **An email change leaves sessions alone.** A sign-in is by the account,
  not by its address, and the person is very likely using the editor in
  another tab.
- **Both write through `UserRepositoryPort.saveCredentials`**, which sets
  the password, the email and whether it is verified and nothing else. `save`
  writes every column as it was read, so a password changed a moment after an
  admin switched the person off would switch them back on.
- **The person is told by mail, at the address that can warn the real
  owner.** A password change sends a notice to the account's own address; a
  confirmed email change sends one to the address being LEFT (the new one
  already got the link). Both are sent after the change is made and are
  best-effort: a failed send does not fail the request — the change stands,
  and a person who is told "it failed" would only do it again — and comes
  back from the use case (`undeliveredNotices`) for the controller to log,
  the way a form's notification that did not go out does (`submitForm`). A
  refused request sends nothing.
- **The reset, the email verification and an accepted invitation write
  narrowly too.** They had the same window: `save` puts back the role and
  the active flag as they were read. The reset and the verification use
  `saveCredentials`; accepting an invitation uses `saveInviteAccepted`,
  which writes the password and the accepted state and only while the
  invitation is still pending — so one cancelled meanwhile is not brought
  back, and a second invitation token (a resend mints another) cannot
  reset the password of somebody who has already accepted.
- **An email is one address whatever case it was typed in.** It used to be
  compared as typed (`findByEmail` was `=`), so `Ana@x.it` and `ana@x.it`
  were two accounts, and a person who typed their address the way they
  always do was told their credentials were wrong. The lookup compares
  `lower(email)`, backed by a unique index on `(tenant_id, lower(email))`
  (migration 0008), and the address is kept as it was typed. The migration
  names the accounts that differ only by case and stops, rather than fail on
  an index. The seed no longer names the old constraint as its conflict
  target. Changing only the case of one's own address is a change, not a
  clash with oneself.

- **The notices are written in the language of the person they are for**
  (docs/adr/0100), which is their own and, before they have chosen one, the
  site's.

## Consequences

- `UserRepositoryPort` has no write of the whole row any more, so a write that
  would put a role or an active flag back as it was read cannot be written by
  mistake: every write names the columns it owns (`saveProfile`,
  `saveAvatar`, `saveCredentials`, `saveInviteAccepted`, `saveAccess`).
