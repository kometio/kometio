# 0091 — A theme can be uploaded from the editor

**Status**: Accepted — 2026-09-28

## Context

ADR-0089 made a theme something that lives in its own repository and is
built on a published builder image. That still takes someone who runs
Docker: copy the theme into the builder, build, ship two images. ADR-0042
had set uploading aside for that reason — the person writing a theme can
run `docker build` — but the person who installs one, or hands one to a
client, should not have to. A theme upload has to be as ordinary as a
media upload: a zip in, a site that uses it out.

Two facts decide how. A theme is compiled into the site: the public site
finds themes with `import.meta.glob`, so a new theme means a new build of
the whole site. And a theme's `.astro` components run on the server that
renders the site, on every request: uploading one is running code there.

## Decision

- **An admin uploads a zip in the Style dialog; everything after is
  automatic.** The theme builder — a service of the same stack, started by
  `docker compose up` like the others — builds the site with it and the
  public site switches to that build. The editor follows the upload
  (queued, building, ready or failed, with the build's output) and offers
  "Use it for this site".
- **The archive is checked before a byte is written, twice.**
  `@kometio/theme-archive` reads it in the API, so the editor hears at once
  what is wrong, and again in the builder, which is the one that writes.
  It refuses a path that climbs out, an absolute path, a link, an
  encrypted entry, more than 20 MB zipped, 80 MB unpacked or 1,000 files,
  and a theme without `theme.json` (with a `name`) and `theme.css` at the
  top. A repository's own furniture (`.git`, `.github`, a Dockerfile,
  `node_modules`) is left out, and a single folder on top is stripped, so
  GitHub's "Download ZIP" works as it comes.
- **The name comes from `theme.json`'s `name`**, and one of Kometio's own is
  refused, in the API and in the builder, as ADR-0089's script already did.
- **Queue and status are files on one volume.** The API writes the zip and
  a `queued` status; the theme builder writes every status after. No
  database and no network for either half of the build.
- **The build runs where it can touch nothing.** Building a site with a
  theme runs the theme's code, so the work is split in two containers.
  `theme-builder`, the trusted half, holds the theme volume and never runs
  theme code: it hands each build to `theme-runner` through a separate
  exchange volume and publishes what comes back. `theme-runner` builds in a
  throwaway copy of the workspace, as an unprivileged user, with a
  read-only filesystem, no capabilities and no network, and sees only the
  exchange directory; it exits after every build, so its container starts
  again clean and nothing a theme left running reaches the next build.
  Links in a build's output are not published. One build at a time,
  10 minutes at most, 4 GB of memory. (The first design ran the build in
  the builder itself, as root on the theme volume: the security review
  showed a theme could then rewrite `current.json` at build time and put
  its own code on the site even with a build that "failed".)
- **The public site switches without a restart.** The builder copies the
  built site into `builds/<id>/` with a link to the public site's own
  `node_modules`, then names it in `current.json`, written atomically.
  `server.mjs` loads that build beside its own and sends every new request
  to it; a request already running finishes where it began. A failed build
  changes nothing the site serves.
- **A build says which packages it was made for.** Only the compiled code
  travels, so the build stamps the installed version of every package the
  site depends on, and the server refuses a stamp that is not its own —
  a builder of another Kometio version cannot hand the site a build that
  breaks on its packages.
- **Only admins, and a deployment can turn it off.** Every route is
  admin-only; without `THEME_DATA_DIR` the API has no uploads and the
  editor offers none. The public playground runs with it off.

## Consequences

- **Uploading a theme is running code on the public site's server.** That
  is what a theme is, and it is why the decision is an admin's. What the
  code can reach is narrowed: the public site no longer gets the whole
  `.env` (it held the database passwords) but only what it reads, and it
  mounts the theme volume read-only. It still holds
  `PUBLIC_API_SERVICE_TOKEN`, which the API trusts for its visitor-IP
  header.
- Two more long-running services, both on the builder image, which is
  large (the whole workspace, installed).
- Every uploaded theme is rebuilt with each new upload, and the build
  before the current one is kept so a site that has not switched yet still
  has what it serves.
- `KOMETIO_THEME`, when set, restricts uploaded themes too.
- There is no way yet to delete an uploaded theme from the editor.

## Amendment 2026-09-29: a theme is trusted code

An uploaded theme is code the site runs, not content, and only an admin
can upload one. What that trust covers, so it is decided once and not
rediscovered by every review (audit B9, B10):

- **In the public site** its code runs in the same process as the site,
  with the same environment. That includes `PUBLIC_API_SERVICE_TOKEN`,
  which does one thing: it lets the API believe the visitor address the
  site reports, for rate limits. A theme could misreport that address;
  a second token would not stop it, since the theme reads whatever the
  process can.
- **In the editor** its icons are drawn as SVG markup. The editor's CSP
  has no `'unsafe-inline'`, so an event handler or a `javascript:` link
  inside one does not run.
- **While it builds** it runs in `theme-runner`: uid 1000, no network, a
  read-only filesystem apart from its scratch space, no capabilities.
  The builder, which runs as root to publish, reads what the runner left
  only as plain files: `compatibility` used to be read where the build
  wrote it, before the copy that drops links, so a theme could make it a
  link and have the builder read any file it can reach into what the
  public site loads. It is now refused unless it is a plain file, and so
  is `theme.json`.
