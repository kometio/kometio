# 0121 — The published images say what they are made of, and are read for advisories

**Status**: Accepted — 2026-10-13. Builds on
[0042](0042-self-hosting-distribution-and-runtime-theme-selection.md) (what is
published and how) and [0101](0101-kometio-is-also-one-image.md) (the single
image).

## Context

An image of Kometio is something other people run on their own machines, with
the account of a site inside it. Before this, what CI gave anyone who wanted to
know what was in one was the Dockerfile and the lockfile, which say what was
asked for and not what is there, and the build's own log, which is gone.

Looked at on 2026-10-13, the published `ghcr.io/kometio/kometio:main` index
already carried one attestation manifest for each architecture: BuildKit's
default provenance, which `merge`'s architecture check already steps around by
leaving out the `unknown` platform. It carried no bill of materials, and
nothing read the packages that are in it — the audit reads the repository's
dependencies, CodeQL its code, and neither sees Alpine's packages, Node's own
npm, or a Go binary that a dependency ships.

## Decision

- **Every published image carries provenance (`mode=max`) and an SBOM** (SPDX,
  made by BuildKit's `docker/buildkit-syft-scanner`, pinned by digest like the
  actions are pinned by commit): the four app images and the single image, on
  both architectures. They are attached to each image as it is pushed by
  digest, and `merge` keeps them: `imagetools create` copies the attestation
  manifests with the images. On a pull request nothing is attached, because
  nothing is pushed — those builds are cache-only or loaded into the local
  store, and neither can hold an attestation.
- **The single image is read for advisories, every day**, by Trivy (a release
  pinned by digest) on the published `:main` (`image-scan.yml`): high and
  critical, with a fix available, packages of the OS and of every language the
  image holds. The result is a table by package in the run's summary and
  code-scanning alerts under Security. A pull request that edits the workflow
  runs it, so that a change to the scan is seen to work before it is on `main`.
- **It reports and does not fail.** An advisory is published on a day nothing of
  ours changed; a build that fails for it stops a release of code that did not
  move. It becomes a gate when the list it opens with is empty: the day it is,
  `--exit-code 1` on the scan and a required check.
- **The single image does not carry npm.** It never installs a package and
  runs `node`; the base image's npm brought four vulnerable copies of its own
  dependencies (tar, undici, brace-expansion, ip-address) with seven advisories
  between them. It is removed in the runtime stage (the layer below keeps the
  bytes; what is gone is what the scan and a process see).

## What the first reading found

On `:main`, 2026-10-13, high and critical with a fix: 32 advisories in five
packages.

- **7, in npm's own dependencies** — removed by the change above; the scan of the
  rebuilt image no longer lists them.
- **25, in the Go standard library compiled into `esbuild` 0.25.12**, the binary
  `vite` uses, which sits in the site's `node_modules`. It is a build tool, and
  nothing in the launcher or in the site's own scripts names it; that is not a
  proof for the code of a theme, which runs there. The fix is an `esbuild` that was built
  with a newer Go, and it comes in through `vite`: a bump of the lockfile of
  every app, which needs the whole browser suite and is not folded into a
  change about reading the images. It is the entry this report opens
  with, and what keeps the scan from being a gate.

## Not in this change

- **Nothing signs the attestations, and nothing verifies them.** They are
  statements attached to the image, readable by anybody, and not a signature a
  tool checks. Signing them (sigstore, through the workflow's own identity) is
  the next step for whoever needs to verify an image and not only to read what
  it says about itself.
- **The four app images are not scanned on their own.** They are the layers of
  the single image and are read through it; `public-site-builder` (a workspace
  with its dev dependencies, for themes) would be noise on a list meant to be
  emptied.
- **A tag older than `main` is not read** unless the run is started by hand with
  the tag.

## Consequences

- Anybody can read what is in `kometio:<tag>` with
  `docker buildx imagetools inspect ghcr.io/kometio/kometio:<tag> --format '{{ json .SBOM }}'`
  and how it was made with `.Provenance`.
- The attestations show in the registry as untagged manifests, one pair for each
  architecture; they are not extra tags and are not pulled by `docker run`.
- The two pinned digests (the SBOM generator in `docker-build.yml`, Trivy in
  `image-scan.yml`) are bumped by hand, with the same care as an action's commit.
