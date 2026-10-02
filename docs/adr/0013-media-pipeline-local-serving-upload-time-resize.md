# 0013 — Media pipeline: API-served local storage, resize at upload time

**Status**: Accepted — 2026-08-18

## Context

Phase 4 (`piano-progetto-astro-cms.md`) needs a real `MediaStoragePort`
implementation. The domain entity (`Media`), the port, the `media` DB
table, and both adapter package shells (`local-disk-media-storage`,
`s3-media-storage`) already existed from earlier planning, empty. Two real
decisions remained before writing them: how an uploaded file becomes
publicly reachable when using the LocalDisk adapter, and when resize/format
conversion happens.

## Decision

### LocalDisk-uploaded files are served by `apps/api` itself

Considered: (A) `apps/api` serves its own upload directory directly (a
static-file route on the same container that receives uploads); (B) a
shared Docker volume that the reverse proxy (Caddy/Traefik, per Phase 6)
serves directly, bypassing the API.

Chose A, confirmed with the user — reasoned through explicitly as "a
generic VPS, Aruba Cloud, DigitalOcean, Hetzner, whatever a self-hoster
already has," not a sophisticated ops setup. One container serving
everything means zero extra reverse-proxy configuration for someone
running `docker-compose up` without a dedicated ops team — matching the
"self-hosting: `docker-compose up` and via" bar already set for Phase 6.
The latency saved by skipping one hop through Node is irrelevant at this
traffic scale.

### Resize + WebP/AVIF conversion happens once, at upload time, fixed sizes

Considered: (A) generate a small fixed set of sizes/formats at upload time
(e.g. a thumbnail and a content-width size, converted to WebP); (B)
on-demand transformation via a query-param endpoint (e.g.
`/media/:id?w=800&format=webp`) with its own cache layer.

Chose A, same reasoning as above — on-demand transformation needs a
caching layer and adds a class of runtime load/failure this product
doesn't need yet. Explicitly scoped to brochure/showcase sites,
confirmed with the user — not e-commerce-scale catalogs with
thousands of dynamically-sized product images.

## Consequences

- Image bytes are never stored in Postgres. `media` only ever holds
  metadata (`filename`, `storageKey`, `mimeType`, `size`, `width`,
  `height`) plus a reference key — the bytes live on disk (LocalDisk) or in
  S3 (S3Compatible). Confirmed explicitly with the user before writing any
  code: "just store it as bytea" is an easy shortcut that would bloat
  backups and queries for no real benefit.
- `apps/api`'s container needs a persistent volume mounted for LocalDisk
  uploads (see Phase 6 Docker packaging) — losing that volume loses every
  locally-stored image, the same operational care already given to the
  Postgres volume.
- **Explicitly not locked in.** This is the reasonable default for the
  product's current shape (showcase sites, modest self-hosted VPS), not a
  claim that on-demand transformation or a CDN-backed pipeline is wrong in
  general. If traffic or catalog size outgrows what fixed-size-at-upload
  comfortably serves, on-demand transformation is a new capability added
  alongside the existing fixed sizes, not a rewrite — already-stored media
  and their URLs keep working either way.
