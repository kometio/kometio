# 0117 — The site keeps the images it makes

**Status**: Accepted — 2026-10-12.

## Context

A review of the project on 2026-10-11 named "SSR on every request, one machine" as the
likeliest thing to wake the owner at night, and proposed a CDN in front. The
site was measured before choosing, on the published image limited to two CPUs
and four GB, with a load generator that gives every request its own address
(the public API limits by address):

| What                                        | Requests per second | p50 at 8 at once |
| ------------------------------------------- | ------------------- | ---------------- |
| a file under `/_astro/` (immutable)         | ≈ 8,000             | 1 ms             |
| a page of one block                         | ≈ 390               | 14 ms            |
| a page of 23 blocks                         | ≈ 300               | 16 ms            |
| `/_image`, one width of a 1.2 MB photograph | **6 to 9**          | ≈ 900 ms         |

The pages are not the problem. The image endpoint is: Astro's endpoint
fetches the original and runs sharp on every request, and keeps nothing —
those 150 ms are paid again by every visitor whose browser has not seen the
picture. A gallery of twenty pictures, opened cold by a hundred visitors, is
two thousand resizes, some five minutes of two CPUs, and a site that answers
nothing else in the meantime. The endpoint already sends a year-long
`Cache-Control`, so a CDN would help — but a CDN is not what most Kometio
installations have: it is a thing a person self-hosts on one machine.

## Decision

- **The site's server keeps what the endpoint answers**
  (`apps/public-site/image-cache.mjs`, in front of Astro's handler in
  `server.mjs`). The first answer of each request — status 200, an image
  type — is written to disk and given back for the same address and Host;
  requests that arrive while it is being made wait for it, so a cold crowd
  costs one resize per size and not one per visitor.
- **It is bounded and disposable**: 256 MB for the whole directory
  (`IMAGE_CACHE_MAX_MB`, `0` off), 8 MB for an entry, the oldest-used going
  first; it lives in the container's filesystem and is made again after a
  restart. A directory that cannot be used is a warning, not an outage.
- **Nothing of the request is kept**: not the CSP (its nonce is that
  request's), not the date or the length.
- **A CDN stays an addition**, not a precondition. With one in front, the
  origin makes each size once and the edge keeps it; without one, the origin
  does both.

## Not decided here

- Resizing at upload time (the variants a page asks for are known), which
  would make the first view cheap too. It touches the media pipeline and the
  `srcset` the blocks write; this is the part that needs no change to either.
- Admission: a visitor can ask for any width, and so fill the cache with
  sizes nobody uses; they are bounded by the directory's limit and each costs
  its own resize, which is what it costs today.

## Consequences

- The same picture at the same width: ≈ 1.5 ms and 4,600 to 13,700
  requests a second instead of ≈ 150 ms and 6 to 9; thirty-six requests at
  once for twelve sizes, cold: 0.67 s, twelve resizes.
- The disk of a container grows by up to 256 MB of regenerable files.
- A picture replaced under the same address is served as it was until the
  entry is evicted or the container restarts: uploads are named by a new id
  each time, so this is the case of an external address only — which the
  endpoint's own year-long `Cache-Control` already allows.
