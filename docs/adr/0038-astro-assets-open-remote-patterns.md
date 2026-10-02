# 0038 — `astro:assets` for image optimization, with an open `remotePatterns` wildcard

**Status**: Accepted — 2026-09-01. Amended 2026-09-29: the open wildcard is no longer the whole story — see the last section.

## Context

`apps/public-site` rendered every picked media image as a plain `<img
src={media.url}>` — a photo uploaded at full camera resolution shipped to
every visitor's browser untouched, in whatever format it was uploaded in.
Astro ships a built-in image optimization pipeline (`astro:assets`, an
`<Image>` component backed by an on-demand `/_image` transform endpoint:
resize to the size actually displayed, convert to a modern format like
WebP) that this project had never adopted.

Two real design forks had to be resolved before this was a matter of
just importing `<Image>`, both presented to the project author as
options before implementing (this session's standing rule for
architectural decisions with genuine trade-offs), covered together here
since the second decision only exists because of the first:

### Fork 1 — where does `image.remotePatterns` get its allowed host from?

`astro:assets` requires every remote (non-bundled) image source to match
an explicit `remotePatterns` allowlist, configured in `astro.config.mjs`
— necessarily at **build time**. But the actual media host
(`API_PUBLIC_URL` for `LocalDiskMediaStorageAdapter`,
`S3_MEDIA_PUBLIC_BASE_URL` for `S3MediaStorageAdapter` — see
`libs/adapters/local-disk-media-storage`/`libs/adapters/s3-media-storage`)
is documented in `.env.example` as explicitly **runtime**-only for this
app (`API_URL`'s own comment: "letta da process.env a runtime, non a
build time"), unlike `KOMETIO_THEME` (build-time-only by design, see
`docs/adr/0021`/`docs/adr/0032`). Two options:

1. **Read the real media host into `remotePatterns` at build time**
   anyway (`process.env.API_PUBLIC_URL` inside `astro.config.mjs`).
   Rejected: this would silently replicate the exact `KOMETIO_THEME`
   gotcha already hit once in this project (see
   [[kometio-theme-env-var-docs-todo]] memory / the warning `Callout` on
   the live `/docs/themes` page) — a second value that's actually
   runtime-configurable per deployment, quietly frozen into whatever it
   happened to be at build time instead, with no error if it drifts.
2. **An open wildcard** — `remotePatterns: [{ protocol: 'https' },
{ protocol: 'http' }]`, matching any host at all.

### Fork 2 — is an open wildcard actually safe here?

An unrestricted `remotePatterns` sounds like it should widen attack
surface (the `/_image` endpoint will fetch and transform whatever URL it's
given) — but every `media.url` this app ever passes to `<Image>` is
already produced server-side by a trusted `MediaStoragePort` adapter,
never typed in or supplied directly by a visitor. An editor with access
to the CMS could already reach arbitrary URLs via the `EmbedHtml` block
(sandboxed in its own iframe, `docs/adr/0025`) — the wildcard doesn't
hand a new capability to a new class of attacker, just to an
already-privileged one.

## Decision

**Option 2 for both**: `apps/public-site/astro.config.mjs` sets
`image.remotePatterns` wide open, and no attempt is made to resolve the
real media host at build time. A new shared component,
`apps/public-site/src/components/OptimizedImage.astro`, is the single
integration point every image-rendering block goes through: it uses
`<Image>` when a picked media's `width`/`height` are known (`astro:assets`
needs both for a remote source, since it has no filesystem access to
infer them), and falls back to a plain `<img>` for media picked before
those fields existed on `PickedMedia`. All 7 image-rendering blocks
(`Image`, `Gallery`, `TeamMember`, `Testimonial`, `LogoStrip`,
`ImageSlider`, `BeforeAfter`) were converted to it — each needed its
scoped `<style>` changed to `:global(.classname)`, since the actual
`<img>`/`<Image>` output is now rendered by a child component and
Astro's scoped styles don't cross that boundary.

### A real deploy-blocking bug found only by testing this live, not by typecheck/build

`sharp` — `astro:assets`' default image transform service — was missing
entirely from `apps/public-site/package.json`. Both `nx typecheck` and
`nx build` succeeded regardless (nothing in either checks that the
runtime image service dependency is actually installed); the failure
only surfaced as `MissingSharp` when a real request hit the `/_image`
endpoint against the running production build. Fixed by adding `sharp`
as an explicit dependency, plus `onlyBuiltDependencies: [sharp]` in
`pnpm-workspace.yaml` — without that, pnpm silently skips the
native-binary install script `sharp` needs, and the same failure would
resurface on a clean install even with the dependency declared.

## Consequences

- Adding a real host allowlist later (e.g. once a hosted/managed
  offering exists with untrusted per-tenant media hosts) is a real,
  separate decision — not something this ADR should be read as having
  ruled out permanently, just not warranted by anything in this
  single-tenant-per-deployment product today (`docs/adr/0032`).
- Every future image-rendering block should go through
  `OptimizedImage.astro`, not a bare `<img>` — the fallback-to-plain-`<img>`
  path already covers the "dimensions unknown" case, so there's no
  remaining reason for a new block to bypass it.
- `sharp`'s native binary is now a real production dependency of
  `apps/public-site` — a self-hosting Dockerfile (still not written, see
  the "Distribuzione e primo avvio" backlog) needs a base image that can
  actually build/run it (glibc-based, not a minimal musl image without
  the usual build toolchain), same constraint any Node project using
  `sharp` in production has.
- Documented for end users (not just internal docs) on the live
  docs-showcase site, `/docs/blocks/image-optimization` — see
  [[block-sdk-and-docs-content-2026-09-01]] memory.

## Amendment — 2026-09-29: `/_image` accepts only this site's media

The assumption above was wrong. It held that every URL reaching `<Image>`
is produced by the server, but `/_image` is a public GET endpoint and its
`href` is whatever the caller writes. With open patterns, anyone could make
the site's server fetch any address, from inside the network it runs in —
the API on `http://api:3000`, a cloud's metadata address — and tell open
ports from closed ones by the status (200 or 500). Reproduced on a local
build before the fix.

What changed:

- **Our own endpoint** (`apps/public-site/src/image-endpoint.ts`, set with
  `image.endpoint`) refuses, with 403 and before anything is fetched, a
  remote `href` that is not under this site's media: `API_PUBLIC_URL/uploads/`
  or `S3_MEDIA_PUBLIC_BASE_URL/`, read at runtime — the per-deployment values
  the API builds media URLs from, now given to the `public-site` container
  as well. The comparison is on the normalised URL, so `../` and `%2e%2e`
  cannot climb out of the folder. Everything else is Astro's own endpoint.
- **`OptimizedImage`** resizes only those same media. An image from
  anywhere else — media from before a change of domain, say — stays a plain
  `<img>` the browser loads itself, instead of an image the endpoint would
  refuse.
- The patterns stay open: they only decide which sources Astro hands to
  the endpoint, and the endpoint is the check.
