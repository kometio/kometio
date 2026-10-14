# Where the data is, and who else gets it

For whoever runs a Kometio, and has to answer a client's "where is my
visitors' data?". It says what the software stores, how long, what leaves the
machine and on what trigger, and what a person can do about it. It describes
the software as of 2026-10-14 and was written from the code; it is not legal
advice, and whether a particular site is lawful is the controller's question,
which is whoever runs it.

## Where it lives

| What                                                                              | Where                                                                                                                                                                                                                     | Single image                   | Compose stack                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| The database: accounts, pages, versions, settings, form answers, the activity log | Postgres                                                                                                                                                                                                                  | `/data/postgres`               | the `postgres` volume                                                     |
| Uploaded files: media, form attachments                                           | `uploads/`                                                                                                                                                                                                                | `/data/uploads`                | the `uploads` volume, or an S3 bucket if `MEDIA_STORAGE_PROVIDER` says so |
| Backups                                                                           | single image: one archive a day, the last seven kept (`KOMETIO_BACKUP_EVERY_HOURS`, `KOMETIO_BACKUP_KEEP`); compose: a dump a day of the database, the last fourteen (`BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`) | `/data/backups`                | the `postgres-backups` volume                                             |
| Exports                                                                           | made on request, removed once sent                                                                                                                                                                                        | `/data/exports`                | the same                                                                  |
| Secrets (the key that seals the AI provider's key, the HTTPS certificates)        | the volume                                                                                                                                                                                                                | `/data/secrets`, `/data/caddy` | the environment, the proxy's own volume                                   |

Everything is on the one machine unless an S3 bucket was chosen for the files.
A backup holds the whole site, accounts' password hashes included, and is
**not** a copy off the machine: copying it elsewhere is what makes it one
(docker/kometio/README.md for the single image, docs/self-hosting.md for the
compose stack).

## What is stored, and about whom

**The people who run the site.** For each account: the email address, a name if
they gave one, a password hash (never the password), the role, a public author
page (slug, bio, picture) if they made one, the interface language, when the
address was verified. For each place they are signed in: a hash of the session
token, a label of the device (a browser and a system, no address, and not the
`User-Agent` string) and the time it was last used, to the nearest five minutes.
Who did what in the settings is in the activity log (below).

**The people who visit.** A visitor has no account and the site keeps nothing
about a page view. What is stored is what they send: the answers to a form
(`form_submissions`: whatever fields the form has, so whatever the person
typed, and the files attached), and a record of the consent they chose, which
is a cookie in their own browser and not a row on the server. The newsletter
address of a visitor is not stored: it goes to the newsletter provider the site
is configured with (below).

**What the content says.** Pages, versions and media are the site's own; if a
page names a person, that is in the page and in every version of it.

**What nobody is asked for.** No IP address is stored with an account, a
session, a form answer or an activity entry. Page views are not counted by the
software.

## How long

| What                                                          | How long                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A signed-in session                                           | 30 days from its last renewal; ended earlier by the person (Account → Where you are signed in), by an administrator who deactivates the account, or by a password change |
| A password reset link                                         | 1 hour                                                                                                                                                                   |
| An invitation                                                 | 7 days                                                                                                                                                                   |
| An address confirmation, or a change of address               | 24 hours                                                                                                                                                                 |
| A preview link                                                | 1 hour (it is signed, not stored)                                                                                                                                        |
| The activity log                                              | 90 days, fixed (`AUDIT_RETENTION_DAYS`)                                                                                                                                  |
| Form answers and their attachments                            | **for ever**, unless the site sets a number of days (Settings → Data retention, `form_submission_retention_days`); then a daily job removes what is older                |
| Backups                                                       | the last seven (single image) or fourteen days (compose), by default                                                                                                     |
| A WordPress import's report, and the addresses read from it   | until somebody deletes the attempt                                                                                                                                       |
| The counts of addresses that were not found (`missing_paths`) | until the rule or the entry is deleted; they hold the path, never who asked                                                                                              |

Expired sessions and tokens are removed once a day.

## What leaves the machine

Only what the site has been configured to send, and each on one trigger.

| To                                                          | What                                                                                                                                                                 | When                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| An SMTP server of the site's choosing                       | The email address and the text of: invitations, password resets, address confirmations, and a form's notification (which carries each field of the answer, as typed) | Only with `SMTP_HOST` set. Without it nothing is sent, and the links go to the server's log                                                    |
| Brevo or Mailchimp                                          | A newsletter subscriber's address                                                                                                                                    | A visitor subscribes, and the site has an API key for it                                                                                       |
| Cloudflare Turnstile                                        | What its widget collects from the visitor's browser                                                                                                                  | Only if the site was given Turnstile keys; by default the captcha is Kometio's own and nothing leaves                                          |
| An AI provider (Anthropic or an OpenAI-compatible endpoint) | The prompt and the description of the blocks                                                                                                                         | A person asks for a page to be generated, with the site's own key                                                                              |
| Sentry                                                      | The unhandled errors of the API and the site: the error, the method, the path and the request number; no body, header, cookie, query string or person (ADR-0114)     | Only with a `SENTRY_DSN`                                                                                                                       |
| An S3 bucket                                                | The uploaded files                                                                                                                                                   | Only if chosen                                                                                                                                 |
| Let's Encrypt                                               | The domain name                                                                                                                                                      | A server with a `DOMAIN` asks for its certificate                                                                                              |
| **Google Fonts**                                            | **The visitor's address and browser, at every page view**                                                                                                            | **When the site's font is anything but "system" (Settings → Style), whether or not the visitor agreed to anything**                            |
| Whoever an embed or a script belongs to                     | What a video, a map, a booking widget, an analytics script learns                                                                                                    | When the page is shown; with the cookie banner on, a block that sets cookies or loads a third party waits for the visitor's consent (ADR-0131) |

## What is in the logs

- **The API's log** has the errors, the starts and the cleanups, each with a request
  number. It never has a password, a session token or a preview token in it.
- **An access log** is off. With `KOMETIO_ACCESS_LOG=true` it has, for each request,
  the method, the path _without its query_, the status, the duration, the size,
  the request number and the signed-in account's id: no address and no header
  (ADR-0122). Caddy's own has the cookies and the headers taken out and no
  addresses, whether or not the switch is on (ADR-0126).
- **With no mail server**, the link of a password reset and of an address
  confirmation is in the log, because it has nowhere else to go; an invitation's is
  shown once to the administrator and is not (ADR-0128). Whoever reads the log is
  who can follow those links, which is why the README keeps the log's size small
  and says so.
- **Postgres's own log** is in the container's: statements are not logged.

## Cookies and what the browser keeps

| By                     | Name                                          | What                                                                  | Lasts             |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------- | ----------------- |
| The editor and the API | `kometio_session`                             | the session's token, `HttpOnly`, `SameSite=Lax`, `Secure` on a server | the session's own |
| The public site        | `kometio_consent`                             | what the visitor chose in the banner, by category                     | 180 days          |
| The public site        | `kometio-promo-bar-dismissed` (local storage) | that the visitor closed the promo bar                                 | until cleared     |

The public site sets no cookie of its own otherwise. What a script or an embed
the site's owner added sets is theirs to declare.

## When somebody asks

- **To see what a site holds about them.** There is no screen for it. An
  administrator can read the answers a person sent in Forms, and an account's data
  is on the Users screen; the activity log is in Settings → Activity.
- **To have a form answer erased.** Forms → the form's answers → delete. It leaves
  the database at once; it stays in the backups that were made before, until they
  are replaced (a week, or two for the compose stack, by default).
- **To have an account erased.** An account is deactivated, not deleted: it cannot
  sign in, and it stays as the author of what it wrote. An invitation nobody
  accepted can be deleted. There is no way yet to erase a person's name from the
  pages and versions they wrote, nor from the activity log within its 90 days
  (entries about an account carry its address as a label).
- **To have everything of a site gone.** Remove the volume. Backups, if copied
  elsewhere, are the copies' owner's to remove.

## What is not done, as it stands

These are the places where this is less than what a site subject to GDPR would
like to say, listed so that they are decided and not found:

1. **Google Fonts is loaded without asking** whenever the font is not the system
   one. The fix is to serve the curated fonts from the site itself; until then,
   the choice "system" keeps the visitor's address away from Google.
2. **No erasure of an account**, only deactivation (above).
3. **No record of consents on the server.** The choice is in the visitor's browser;
   if a site has to prove, later, that a person agreed, there is nothing to show
   (a consent ledger was considered and left out for now).
4. **Form answers are kept for ever by default.** Setting a number of days is one
   field, and is the site's decision to take, not the software's.
5. **A backup is a copy of everything**, the activity log and the answers a person
   asked to be erased included, until it is replaced (seven or fourteen days, by
   default).
