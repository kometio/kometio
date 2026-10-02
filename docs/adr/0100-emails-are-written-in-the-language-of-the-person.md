# 0100 — Emails are written in the language of the person they are for

**Status**: Accepted — 2026-09-30

## Context

Every email the system sends — the invitation, the password reset, the
verification of an address, the link to a new address, the notices that follow
a change of password or address, a form's notification — was written in
Italian, whatever the person reading it speaks. The editor itself is in two
languages (Italian and English), chosen from its own menu, but the choice was
a property of the browser tab: it was forgotten on every reload, and nothing
on the server knew it.

## Decision

- **Each person has a language of their own**, kept with the account
  (`users.language`, nullable, migration 0009). It is chosen from the
  editor's language selector, which saves it (`PATCH /account/language`) as
  well as changing the screen, and it is what the editor opens in the next
  time. The languages are the ones the editor is translated into
  (`INTERFACE_LANGUAGES` in shared-types, `it` and `en` today); the API
  refuses any other.
- **Whoever invites chooses the invitee's language.** The invitation is
  written in it and it becomes the invitee's own, until they choose another.
  The invite dialog offers the inviter's own language to begin with.
- **A person who has not chosen is written to in the site's language**
  (the default locale of the site the deployment serves, as `it-IT` → `it`),
  and in English when that is not a language the emails exist in, or there is
  no site to ask. That language is not stored as theirs: if the site changes
  language, so do they, until they choose. The port is `DeploymentLocalePort`;
  the adapter wraps `DeploymentSiteResolver`, and never throws — a password
  reset that failed only for accounts that exist would say which ones do.
- **A form's notification follows the site's language.** Its recipients are
  addresses somebody typed in the form's settings, not accounts that chose.
- **The copy of each email is a record over `INTERFACE_LANGUAGES`**, next to
  the template that uses it, so a third language does not compile until every
  email, the layout's footer and the editor's own `Record` of resources have
  it. Every email declares its language in `lang` on the outer table.
- **The email to a NEW address is in the language of the person who asked**
  for the change, not of the address it goes to.

## Consequences

- Adding a language is: a name in the editor, a locale file, and one entry in
  each email's copy — the compiler lists what is missing.
- The language of the mail to somebody who has never chosen can change when
  the site's default language does. That is deliberate: nothing was chosen, so
  nothing is frozen.
- An account created before this (no language) keeps being written to in the
  site's language — Italian for every existing deployment, as before.
