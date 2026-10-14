# 0128 — An invitation with no mail server gives its link to the administrator, and the log does not keep it

**Status**: Accepted — 2026-10-14. Amends [0103](0103-a-server-can-run-without-a-mail-server-or-cloudflare.md):
the invitation is no longer one of the emails that go to the log.

## Context

Without `SMTP_HOST`, ADR-0103 has each email written to the API's log, link
included, "for whoever runs the server to find". That was the cheapest thing that
made a first server usable, and the review of 2026-10-11 (SEC-6) named what it
costs for an invitation:

- **The log holds a credential for as long as the log is kept.** An invitation
  link signs in as the invitee, with a role the administrator chose (up to
  administrator), and works for seven days. Logs are shipped, pasted into
  support threads and kept by the platform for weeks, by people who were never
  meant to be able to become somebody else on the site.
- **The person who needs the link is not the person who reads the log.** On a
  server the freelancer runs for a client, the client is the administrator of the
  site and has no access to `docker logs`. Inviting a colleague meant asking
  somebody else for a line of a log.

A password reset is a different case, and stays where it is. Its link goes to
somebody who is not signed in, asked for from a public screen: there is no
administrator on whose screen it could appear, and the whole point is that the
answer must not tell anyone which addresses have an account.

## Decision

- **An invitation made on a server that cannot deliver mail answers with its
  link** (`inviteLink` in the answer of `POST /users/invite` and of
  `POST /users/:id/resend-invite`), to the administrator who asked, and `null`
  when an email was sent. The editor shows it in a dialog of its own, with a copy
  button, and says it is shown only now.
- **Nothing else keeps it.** Not the log (which says "no mail server is
  configured, so nothing was sent to x@y; the link was shown to the administrator
  who made it"), not the list of users, not a field of the record. The answer is
  `Cache-Control: no-store`. The way to another is "Resend invite", which makes a
  new link and leaves the earlier one working until it expires or is used, as it
  always has.
- **The port says whether it delivers.** `EmailPort.delivers` is `true` for SMTP
  and `false` for the log adapter (and so for a demo, which sends nothing
  whatever it is configured with, ADR-0118). A use case that has a link only its
  recipient should hold asks it, and does not send through an adapter that will
  write the message down. `GET /deployment` and `createEmailPort` take it from one
  function, so the editor's notice and the behaviour cannot differ.
- **Invitation and resend share one path** (`issueInvite`): the token, its
  seven-day life, the link and the choice between sending it and handing it back
  were written twice, and a second copy of a decision about a credential is how
  one of them gets fixed and the other does not.
- **The log says what it holds.** Each entry of the log adapter now carries a line
  that a link in it is for whoever reads the log and the log is not to be shared:
  what stays there (a reset, the confirmation of a new address, a form's
  notification) is read by a person who should know it is a secret.

## Not in this change

- **A reset's link is still in the log.** Giving it to an administrator would
  mean the administrator can sign in as anyone, which is a different decision
  from carrying an invitation to its invitee; and a person who has forgotten their
  password and asked for one has, on such a server, nobody else to tell. The
  warning on the entry and ADR-0103's "whoever reads it runs the server" stay.
- **A refused message is not turned into a link.** A server with a mail server that
  did not take the message still answers `emailSent: false` and no link: the
  administrator is told to use "Resend invite" once it works. Handing the link
  over there too would be a second way to the same thing, decided on its own.

## Consequences

- The first-run browser test follows the whole path on an installation with no
  mail server: the administrator invites, the dialog shows the link, a browser that
  has never seen the editor opens it and chooses a password. `check.sh` asserts the
  log has the invitation's line and not its link.
- An administrator who closes the dialog without copying the link makes another
  with "Resend invite". The first one still works, as before.
