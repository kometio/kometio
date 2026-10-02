# Security policy

Kometio is in public beta. Fixes land on `main` and in the latest release;
older releases are not patched.

| Version                       | Supported |
| ----------------------------- | --------- |
| `main` and the latest release | Yes       |
| Anything older                | No        |

## Reporting a vulnerability

Please do not open a public issue or pull request for a security problem.

[Report it privately through GitHub](https://github.com/kometio/kometio/security/advisories/new).
Only the maintainers can see the report. If you can, include:

- the affected version or commit, and how Kometio is deployed (the Docker
  images, or built from source);
- the steps to reproduce it, or a proof of concept;
- what an attacker gains: whose data, which action, with what access.

Please test only against your own installation, never against someone else's.

## What to expect

This is a small project, so these are targets and not promises. We aim to
acknowledge a report within 7 days and to tell you within 14 days whether we
consider it valid. Once a fix is released we publish a GitHub security advisory
and credit you, unless you prefer not to be named. If a report turns out not to
be a vulnerability, we will say why.

## Scope

In scope: the code in this repository and the images published from it
(`ghcr.io/kometio/kometio-*`) — the API, the editor, the public site and the
theme builder; authentication and sessions; tenant isolation (Row Level
Security); uploads and media; form handling and the email it sends; the AI page
generator and the outbound requests it makes.

Out of scope:

- a deployment's own configuration: weak passwords or keys in a `.env`, an
  exposed database port, a missing reverse proxy;
- themes and other extensions written by third parties;
- an advisory against a dependency that is already public: Dependabot and the
  `audit` job in CI track those, and they are fixed by updating. Report one only
  if the way Kometio uses the dependency makes it exploitable in a way the
  advisory does not describe;
- denial of service by sheer volume of traffic, and social engineering.
