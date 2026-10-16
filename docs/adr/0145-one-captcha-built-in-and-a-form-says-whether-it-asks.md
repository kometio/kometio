# 0145 — One captcha, the one built into Kometio, and a form says whether it asks for it

**Status**: Accepted — 2026-10-16. Amends [0103](0103-a-server-can-run-without-a-mail-server-or-cloudflare.md): Cloudflare Turnstile is gone.

## Context

ADR-0103 gave a server two captchas: Cloudflare Turnstile when the owner had
a site's keys, and the one built into Kometio (ALTCHA, a proof of work the
browser solves in the background) when not. It was the right way to get a
server running without an account at an outside company, and it left the
product with a second provider that nobody on the way had chosen:

- **Two of everything.** An adapter, a widget in the editor and another on the
  public site, a Content-Security-Policy that named Cloudflare's origin, three
  variables (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and the editor's
  build argument), a rule that refused one key without the other, a rule that
  refused Cloudflare's own test keys, and an endpoint that answered 404 on
  one deployment and a challenge on the other.
- **A company the visitor's browser talks to.** For the people Kometio is
  written for, that is the thing a data-protection page has to explain, and
  the owner asked for it to go.
- **No way to say "this form does not need one".** Every form asked, whatever
  it was for.

The owner decided three things: only the built-in captcha; the choice is made
on the form itself, and the server enforces it; and a form asks unless its
owner says otherwise.

## Decision

- **Turnstile is removed, not deprecated.** The adapter
  (`@kometio/turnstile-captcha`), its widgets, the keys, the origin in the
  policies and the 404 branch of the challenge route are gone. A `TURNSTILE_*`
  variable left in an environment is ignored (a spec says so): a deployment
  that had keys keeps starting, and its captcha is the built-in one from then
  on. `createCaptcha` returns one adapter that is both the verifier and the
  source of challenges.
- **A form carries `captchaEnabled`, on by default.** `forms.captcha_enabled
boolean not null default true` (migration 0017), so every form that existed
  asks, as it did. It is edited on the form's own screen, next to who is
  emailed, and saved with the rest of the form; a copy of a form keeps it.
- **The server is the one that enforces it.** `submitForm` verifies a
  solution only when the form asks, and refuses without one when it does. A
  page that drew no widget therefore needs no token, and a page that drew
  one cannot be talked out of it by a client that leaves the token out of
  the request. What a form that asks for none still has is the **honeypot**
  and the **rate limit**, which is what the screen says.
- **The public form tells the page.** `GET /public/forms/:id` carries
  `captchaEnabled`, and `Form.astro` draws the widget (and its script) only
  when it is true. A form turned on between a visitor loading the page and
  sending it is refused with the same message as any refused captcha, which is
  the visitor's cue to reload.
- **A PATCH that does not mention it turns it on.** The update body replaces
  the form whole, and the safe answer to a client that never heard of the
  setting is to keep asking.
- **The newsletter signup has a site-wide switch.** The block has no entity of
  its own to carry a choice (ADR-0015 left it decoupled on purpose), and
  nothing in a request can be believed about which block it came from, so the
  choice is the **site's**: `sites.newsletter_captcha_enabled` (same migration,
  same default), edited in Settings → Newsletter by whoever may configure the
  site, behind a question when it is turned off, and recorded in the activity
  log.
- **The newsletter's site is the deployment's own, never the request's.**
  `POST /public/newsletter/subscribe` reads the setting of the one site this
  deployment serves (ADR-0032), through the same resolver the editor's
  `GET /sites/current` uses, and `GET /public/pages/newsletter` answers the
  page from the same place. Neither takes a domain from the caller, so nobody
  can name another site's setting to get past their own, and the page cannot
  draw one thing while the server asks for another. The read is on the
  visitor-aware guard of the other public page reads (120 a minute), not the
  write endpoints' (10); when the page cannot get the answer it draws the
  widget, since a signup that cannot succeed is worse than a check.
- **Who may turn it off follows what is being edited.** A form's switch is
  part of the form, which has no draft, so it is a **publisher's**
  (`changeLiveSite`, as every other change to a form: docs/roles.md) and the
  PATCH of a form is the only way to set it; a copy keeps the original's and a
  starter's forms ask. The newsletter's is a setting of the site, so it is an
  **administrator's** (`configureSite`, as the retention and the SEO settings
  are). An editor changes neither.
- **Login, password reset and the first-run setup are not switchable.** They
  always ask: they are the doors to the accounts.
- **Scripts solve it like the widget does.** `tools/solve-captcha.mjs` fetches
  a challenge, solves it with `node:crypto` alone and prints the token. It
  depends on nothing on purpose (`docker/kometio/check.sh --smoke-only` runs
  on a machine where nothing was installed), and its spec checks its answers
  with the library the API checks them with, so a change of the protocol fails
  there. `check.sh` and the end-to-end suite's login use it; nothing in the
  product accepts a placeholder token any more, so an installation can no
  longer be made to pass a captcha by a configuration.

## What this does not do

- **It does not make the built-in captcha stronger.** It is a proof of work:
  it keeps scripts that do not bother out and costs the others a second. It is
  not the last word on abuse, and the image's README says so.
- **The switch is not per block for the newsletter.** Every signup block of
  the site follows the one setting.
- **A site's switch is the site's, not the list's.** A deployment serves one
  site, so there is one list behind it; if that ever stops being true, the
  setting has to move to wherever the list's address lives.

## Consequences

- Two columns, one migration, one field on a form's record and on the site's.
- The integration specs of the API no longer log in with a token Cloudflare's
  test key accepts: the fixture puts the fake captcha in, and the captcha's own
  spec signs in with a real solution, once, and refuses it the second time.
- A deployment that had Turnstile keys loses nothing but the dependency: its
  forms ask, now with the built-in captcha, until the owner says otherwise.
- The data-protection page no longer lists a company for the captcha.
