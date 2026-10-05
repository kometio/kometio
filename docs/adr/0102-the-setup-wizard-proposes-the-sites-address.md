# 0102 — The setup wizard proposes the site's address

**Status**: Accepted — 2026-10-05

## Context

The first-run wizard created the site with no domain, on purpose: it ran
"before anyone can know the public hostname", and the domain was left to
**Site settings**. That was written when the editor and the public site were
two things somebody had configured separately. The public site finds a site by
the `Host` header of the request, so a site without a domain is found at no
address: every URL of the public site answered "not found", and on a trial it
answered 404 in Italian whatever language the site was set up in. A person who
had just finished the wizard, and had followed every step, saw a broken site and
nothing that said where to fix it. The quickstart had to carry a fourth step
only to repair that, and `docs/self-hosting.md` said the domain was "still yours
to do".

The premise no longer holds. The deployment is told the address it serves the
site on (`PUBLIC_SITE_URL`, which the editor reads as `publicSiteUrl`, and which
it already uses for its own "View page" links), so the wizard can know the
hostname before anyone types it.

## Decision

- **The setup form has a Domain field, already filled in** with the hostname of
  `publicSiteUrl` (`domainOfAddress`: no scheme, no port, no path, in lowercase;
  empty when the address is not one a site can be found on, such as an IPv6
  literal). Leaving it alone is the right answer, so the wizard is no longer in
  the way of someone who has not seen the product yet; it is still a field,
  because the proposal can be wrong (a proxy, a name not yet pointed here).
- **It is the same field as in Settings → General.** The same word, the same
  clean-up of what is pasted from an address bar (`cleanDomainInput`, which
  says what it took out), the same rule (`siteDomainSchema`, shared with the
  API). Emptying it is allowed and means "set it later".
- **The API takes it in the setup request**, optional, and checks it with the
  rule the Site settings request is checked with: an address that is not a
  hostname is refused with a 400 and nothing is stored. A request without it, as
  an older client sends, creates the site with no domain as before. It reaches
  the `sites` row in the same transaction as the tenant, the site, the first
  user and the home page.
- **Nothing else about the wizard changes.** It still asks for the setup
  token, a name, a language, an email and a password; the domain was the only
  thing the person had to know and could not.

## Consequences

- On a trial, on a server that gave `PUBLIC_SITE_URL`, and on the compose stack
  (`https://<domain>` by default), the site answers as soon as the wizard
  finishes, with its own home page. The quickstart loses its fourth step.
- Where `PUBLIC_SITE_URL` is not the name visitors use (a CDN or proxy in
  front, a name that does not point here yet), the proposal is wrong and shows
  in a field that can be corrected, or emptied, instead of being silently null.
- A site can still have no domain: by choice in the wizard, or after clearing
  it in Settings. The sidebar's "Domain not set yet" and the launch checklist
  are unchanged.
- The two other first-run defects found while walking this flow were separate
  and are fixed apart: a login cookie left by another installation on the same
  host (answered 503, then a white page; `SessionAuthGuard` now answers it as
  "no session"), and the captcha key being a build input (ADR-0076).
