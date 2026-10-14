# 0129 — A person sees where they are signed in, and can end any of it

**Status**: Accepted — 2026-10-14.

## Context

A session was a token hash, an expiry and a creation date (ADR-0010). The only
ways one ended were the person signing out of it, its thirty days running out,
and a password change or reset ending all the others at once. Nothing said to
the person which devices were signed in, so there was no way to act on the one
case where it matters: a laptop left in an office, a phone that is gone, a
sign-in on a machine that was borrowed. Changing the password was the only
lever, and it is a lever for a stolen password, not for a left-open session.

The review of 2026-10-11 (SEC-4) asked for the list, with the condition that it
not become a new store of personal data: a table of addresses and browser
fingerprints is a worse thing to lose than the sessions it describes.

## Decision

- **A session keeps a label and a last use, nothing else about the device.** The
  label is `Chrome on macOS`, made from the `User-Agent` at sign-in by
  `describeDevice` and never stored as the header: the version, the model, the
  build and whatever a client chose to send are not kept. An agent it does not
  recognise gives no label and the person is shown "Unknown device". There is no
  address and no location.
- **A use is noted to within five minutes.** `validateSession` writes
  `last_used_at` only when the last note is older, in the same statement as a
  renewal when there is one, so being signed in is not a write per request and
  "active now" is a claim the server can stand behind.
- **The list is the person's own, and ending one is by an id that is not the
  token.** `GET /account/sessions`, `DELETE /account/sessions/:id` and
  `DELETE /account/sessions` (every other one) take no user id: the only sessions
  they can reach are those of the account the request is signed in as. The id is
  the row's, not a hash or a token, so the list holds nothing that is a way in.
  Another person's id answers 404 as one that never existed does.
- **The device the request comes from is not ended from the list** (409): that is
  signing out, which clears the cookie as well; a list that ended its own
  session would leave the browser holding a cookie for nothing.
- **A demo does not show it.** Its account is everybody's; the routes are refused
  there by the rule that already closes the account, and the editor does not draw
  the section.

## Not in this change

- **No new-sign-in email.** Telling a person that a device just signed in as
  them is a second feature with its own decisions (whether it is sent when no
  mail server is configured, what it says in a language the account may not have
  chosen); the list is what a person goes to when they have a reason to look.
- **An administrator does not end another person's sessions from here.**
  Switching an account off already ends them all, and nothing needs the middle.
- **Sessions made before this have no label.** They are listed as "Unknown
  device" with their last use set to the day of the migration, and are replaced
  as people sign in.

## Consequences

- Migration `0012_session_devices`: `device_label text`, `last_used_at timestamptz
NOT NULL DEFAULT now()`. Row-level security is the table's, as before.
- `AuthPort` has `listSessionsForUser` and `invalidateSessionOfUser`;
  `createSession` takes an optional `{ label }`.
