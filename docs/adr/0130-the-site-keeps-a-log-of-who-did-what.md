# 0130 — The site keeps a log of who did what

**Status**: Accepted — 2026-10-14.

## Context

When something on a site has changed and nobody says who changed it — a role
that is not the one it was, a setting that is not what it was, an archive that
somebody downloaded — there was nothing to look at. The only trace was the API's
own log, which says that requests happened, not which administrator's they were,
and which is kept by whoever runs the server and not by the person who runs the
site. The review of 2026-10-11 (SEC-5b) asked for the answer to "who did what",
with the condition that the answer not become a record of the people who
visit, or of what was typed.

## Decision

- **A log of security and configuration events, and none of the content ones.**
  Signing in and failing to; inviting, changing a role, switching on and off;
  a password or an address changed; the site's settings, its theme, its AI key;
  taking the archive. Not a page that was edited, published or deleted, not a
  file, not a form: those have their own histories (versions, the library) and
  logging them would make this a second copy that disagrees with the first.
- **An entry is: when, the account that did it, what, what it was done to, and
  a few small facts.** The facts are a schema of small values (`auditDetailSchema`:
  which role, which part of the settings, why a sign-in was refused), so that the
  column cannot become a place to put a request body. An AI key is "a key was
  given", never the key; a setting is "the general settings", never what they
  were set to.
- **No address.** Nothing about where a request came from is kept: not the
  address, not the agent. A log that held them would be a list of the people who
  tried the login form, and the sign-ins of the people who are there are in the
  list of devices (ADR-0129), which holds a label and no address either.
- **A failed sign-in is written for an account that exists.** A wrong password,
  or the right one for an account that is switched off. An address nobody has is
  not recorded: it is whatever a person typed, and a table that took whatever it
  was given would be filled by whoever tried. The answer to the person is the same
  whichever it was (ADR-0011); the log is the administrator's.
- **Append-only, in the database's own terms.** The application's role is
  granted `SELECT`, `INSERT` and `DELETE` on the table and has `UPDATE` revoked:
  an entry is a statement of what happened and nothing in the application can
  change one. `DELETE` is the clean-up's.
- **Ninety days, fixed.** A scheduled job removes what is older, once a day
  (`AUDIT_RETENTION_DAYS`). It is not a setting: a log that each site shortens
  is a log nobody can rely on being there, and one that is kept longer is a
  history. The Data retention section says the number, so that it is where a
  person looking for what is kept will find it.
- **Written by the controller that has the answer.** The API's controllers
  record the entry once the use case has done what it did, because that is where
  the actor (the session), the target (what the use case returned) and the fact
  that it worked are all known. Where nobody is signed in (a reset link, a
  confirmed address) the use case answers whose it was. The alternative, an
  interceptor that records from a decorator, was left: it has no way to know the
  target of a request without parsing its own answer, and a log that decodes
  answers is a second reader of every contract.
- **It never fails the thing that was done.** A role that was changed stays
  changed if its entry could not be written, and the administrator is not told it
  failed: the failure is for the server's log (`AuditRecorder`). The activity log
  is never the reason an action is refused.
- **Settings → Activity, an administrator's** (`configureSite`): the entries
  newest first, in pages of 25, each as one sentence in the person's language.

## Not in this change

- **No content events.** If an agency wants "who published this page", that is a
  second decision with its own cost (a row per save), and the version history of a
  page already says it.
- **No export of the log, no alert.** It is read on a screen. Sending it
  somewhere or telling someone when a sign-in fails five times is a feature
  built on it, and the shape of the table does not stand in its way.
- **Not configurable.** See above.
- **A flood of failed sign-ins is bounded by the login limits** (five a minute
  for an account from one address, thirty in fifteen minutes for an account
  from anywhere) and only for accounts that exist; sustained for ninety days
  that is the order of hundreds of thousands of small rows for one account,
  which the clean-up removes and a page of 25 hides. If it is ever more than
  that, collapsing repeats is the change to make.

## Consequences

- Migration `0013_audit_events`; one new library (`postgres-audit-log-repository`)
  and a method on `ExpiredRecordsPort` for the clean-up.
- A controller that does something an administrator should be able to look up
  later injects `AuditRecorder` and says so after it has done it; the list of
  what can be said is `AUDIT_ACTIONS`, which the editor must word
  (`activity.actions.*`, checked by a test).
