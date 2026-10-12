# 0118 — A deployment can be a public demo

**Status**: Accepted — 2026-10-12.

## Context

The announcement is meant to let a visitor open the editor and try it. The
review of 2026-10-11 listed what that costs when the account is shared and its
password is on the page: the password and address changeable by anyone who
knows it, the same five tries a minute used up for everybody, an admin who can
invite other admins and put scripts on the main origin, uploads of any kind
into a disk that also holds the database, an embed block that runs pasted HTML
with forms and popups at the demo's own address, an AI key and an archive with
the hash of every account behind one login.

The question put to the owner was the shape of the playground: one shared
instance in a restricted mode, one disposable instance per visitor, or no
hosted editor. The first was chosen. This is that mode.

## Decision

- **A deployment says it is a demo: `KOMETIO_DEMO=true`.** One environment
  variable, read by the API and the public site. It is a property of a
  deployment, not a role: the permission table of
  [ADR-0093](0093-who-may-do-what-is-one-table.md) is unchanged.
- **Nobody there configures the site.** Everything that needs `configureSite`
  (the site's settings, its users, its AI key, themes, imports, the archive)
  is admin-only, so in a demo an admin is a publisher: the API's `/auth/session`
  says `publisher`, which is what the editor draws its screens from, and a
  global guard refuses with 403 every route only an admin may call. The
  account can be an admin on paper — the first account of any site is — and
  a visitor still cannot invite, export, change the theme or the AI key.
- **The few things a publisher may do that are not the demo's to give are
  refused by name**, in one table (`REFUSED_IN_DEMO`): uploading a file
  (`POST /media`, the avatar, a form's attachments), any write to the account
  but its language — its password, its address, its profile — and reading the
  submissions of a form, which in a demo are what strangers typed and the
  next stranger would read. The table is read by the same guard, so a route
  added next month falls under the admin-only rule without anybody
  remembering.
- **The table names routes, not addresses.** Express matches an address
  without regard to case and with or without a final slash (`/MEDIA`,
  `/media/`): the guard reads the route the request matched
  (`request.route.path`), which is one string for every spelling. A request
  that somehow has none is refused if it writes.
- **The public site keeps search engines out** (`robots.txt` and the page's
  `noindex`, whatever the site's own setting) **and does not run an embed**:
  `EmbedHtml` shows a line saying so. Settings that put scripts on every page
  are `configureSite`, so closed already; what the editor pastes into a block
  is what is left.
- **The editor is told** by `demo` in `GET /deployment`, which is open to
  anyone like the rest of that record.

## What this does not do

- **It does not reset.** A demo is reset by being made again from a seed
  archive; that is operations (`docker/kometio/README.md`), not the
  application's business.
- **The editor still draws what a demo refuses** until its own change lands:
  the upload button answers 403 with a sentence, which is correct and not
  kind.
- **Two visitors in one demo see each other's edits.** Accepted on
  2026-09-25: it is the price of one shared instance.
- **Rate limits are the deployment's own** (the login's five a minute per
  address and account; the public API's 120 a minute per address).

## Consequences

- A demo can be run from the published image with one more `-e`.
- What a demo is able to do is the permission table minus that table, and the
  one place to read it.
- An admin credential in a demo is worth no more than a publisher's, so the
  seed archive can carry the site's own first account.
